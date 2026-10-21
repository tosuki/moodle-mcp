import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MoodleService } from '../services/moodleService';

export function registerAssignmentTools(server: McpServer): void {
  server.tool(
    'moodle_get_assignment_status',
    'Retrieves detailed submission status, due date, time remaining, grading status, and submitted files/text for a specific Moodle assignment module.',
    {
      cmid: z.number().describe('Course module ID of the assignment (e.g. 132724)'),
    },
    async ({ cmid }) => {
      try {
        const moodle = new MoodleService();
        const details = await moodle.getAssignmentDetails(cmid);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(details, null, 2),
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
              text: `Failed to get assignment status for ID ${cmid}: ${message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'moodle_submit_assignment',
    'Submits an exercise or homework assignment to Moodle via native HTTP multipart upload. Supports uploading solution files and/or submitting online text, with option to finalize submission.',
    {
      cmid: z.number().describe('Course module ID of the assignment (e.g. 132724)'),
      filePath: z
        .string()
        .optional()
        .describe('Absolute path of the local file to upload (PDF, code, ZIP, etc.)'),
      onlineText: z
        .string()
        .optional()
        .describe('Text or code to submit for assignments accepting online text input'),
      confirmFinalSubmission: z
        .boolean()
        .optional()
        .describe('Whether to permanently finalize the submission (if instructor requires confirmation). Defaults to false.'),
    },
    async ({ cmid, filePath, onlineText, confirmFinalSubmission }) => {
      try {
        const moodle = new MoodleService();
        const result = await moodle.submitAssignment({
          cmid,
          filePath,
          onlineText,
          confirmFinalSubmission: confirmFinalSubmission ?? false,
        });

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
              text: `Failed to submit assignment for ID ${cmid}: ${message}`,
            },
          ],
        };
      }
    }
  );
}
