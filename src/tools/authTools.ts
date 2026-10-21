import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthService } from '../services/authService';
import { MoodleService } from '../services/moodleService';

export function registerAuthTools(server: McpServer): void {
  server.tool(
    'moodle_login',
    'Opens a visible browser window allowing the student to complete institutional Microsoft Teams/Azure AD SSO authentication (supporting 2FA). Automatically harvests session cookies and sesskey, unlocking all other tools.',
    {
      timeoutSeconds: z
        .number()
        .optional()
        .describe('Maximum time in seconds to wait for user to finish login (default: 180s)'),
    },
    async ({ timeoutSeconds }) => {
      try {
        const timeoutMs = (timeoutSeconds || 180) * 1000;
        const result = await AuthService.performInteractiveLogin({ timeoutMs });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Interactive login failed: ${message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'moodle_status',
    'Checks whether the Moodle session is currently active and valid, returning the student identity and last updated timestamp.',
    {},
    async () => {
      try {
        const moodle = new MoodleService();
        const status = await moodle.getStatus();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to check session status: ${message}`,
            },
          ],
        };
      }
    }
  );
}
