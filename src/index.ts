#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAuthTools } from './tools/authTools';
import { registerCourseTools } from './tools/courseTools';
import { registerResourceTools } from './tools/resourceTools';
import { registerAssignmentTools } from './tools/assignmentTools';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'moodle-esdhc',
    version: '1.0.0',
  });

  registerAuthTools(server);
  registerCourseTools(server);
  registerResourceTools(server);
  registerAssignmentTools(server);

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('[moodle-esdhc] MCP Stdio Server running successfully.');

  process.on('SIGINT', async () => {
    console.error('[moodle-esdhc] Received SIGINT. Shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[moodle-esdhc] Received SIGTERM. Shutting down...');
    await server.close();
    process.exit(0);
  });
}

if (require.main === module) {
  runServer().catch((err: unknown) => {
    console.error('[moodle-esdhc] Fatal server error:', err);
    process.exit(1);
  });
}
