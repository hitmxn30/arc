import OpenAI from "openai";
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
                },
                {
                    "type": "function",
                    "function": {
                        "name": "Write",
                        "description": "Write content to a file",
                        "parameters": {
                            "type": "object",
                            "required": ["file_path", "content"],
                            "properties": {
                                "file_path": {
                                    "type": "string",
                                    "description": "The path of the file to write to"
                                },
                                "content": {
                                    "type": "string",
                                    "description": "The content to write to the file"
                                }
                            }
                        }
                    }
                },
                {
                    "type": "function",
                    "function": {
                        "name": "Bash",
                        "description": "Execute a shell command",
                        "parameters": {
                            "type": "object",
                            "required": ["command"],
                            "properties": {
                                "command": {
                                    "type": "string",
                                    "description": "The command to execute"
                                }
                            }
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
                    const args = JSON.parse(toolCall.function.arguments)
                    if (functionName === 'read') {
                        const { file_path } = args;
                        let content = '';
                        try {
                            content = fs.readFileSync(file_path, 'utf-8');
                        } catch (error) {
                            content = `Error reading file: ${(error as Error).message}`;
                        }
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: content,
                            });
                    } else if (functionName === 'write') {
                        const { file_path, content } = args;
                        let result = '';
                        try {
                            const dir = path.dirname(file_path);
                            if (dir) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            fs.writeFileSync(file_path, content || '', 'utf-8')
                            result = `File written successfully to ${file_path}`;
                        } catch (error) {
                            result = `Error writing file: ${(error as Error).message}`;
                        }
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: result
                        });
                    } else if (functionName === 'bash') {
                        const { command } = args;
                        let result = '';
                        try {
                            const { stdout, stderr } = await execAsync(command);
                            result = stdout || stderr || 'Command executed with no output';
                        } catch (error) {
                            // If the command failed, error will contain message (and potentially stdout/stderr)
                            result = `Error executing command: ${(error as Error).message}`;
                        }
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: result
                        });
                    } else {
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: `Error: Tool ${toolCall.function.name} is not supported.`
                        });
                    }
                }
            }
        }
    }
}

main();
