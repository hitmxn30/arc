import OpenAI from "openai";
import fs from 'fs';

async function main() {
    const [, , flag, prompt] = process.argv;
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseURL =
        process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not set");
    }
    if (flag !== "-p" || !prompt) {
        throw new Error("error: -p flag is required");
    }

    const client = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
    });

    const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "user", content: prompt }]

    console.error("Logs:");

    while (true) {
        const response = await client.chat.completions.create({
            model: "anthropic/claude-haiku-4.5",
            messages: messages,
            max_tokens: 1000,
            tools: [
                {
                    "type": "function",
                    "function": {
                        "name": "Read",
                        "description": "Read and return the contents of a file",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "file_path": {
                                    "type": "string",
                                    "description": "The path to the file to read"
                                }
                            },
                            "required": ["file_path"]
                        }
                    }
                }
            ]
        });

        if (!response.choices || response.choices.length === 0) {
            throw new Error("no choices in response");
        }

        const choice = response.choices[0];
        const message = choice.message;

        messages.push({
            role: 'assistant',
            content: message.content ?? null,
            ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
        })

        if (!message.tool_calls || message.tool_calls.length === 0) {
            if (message.content) {
                console.log(message.content);
            }
            break;
        }

        if (message.tool_calls && message.tool_calls.length > 0) {
            for (const toolCall of message.tool_calls) {
                if (toolCall && toolCall.type === "function") {
                    const functionName = toolCall.function.name.toLowerCase()
                    if (functionName === 'read') {
                        const args = JSON.parse(toolCall.function.arguments)
                        const { file_path } = args;
                        const content = fs.readFileSync(file_path, 'utf-8')
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: content,
                        });
                    }
                }
            }
        }
    }
}

main();
