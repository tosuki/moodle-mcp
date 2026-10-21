import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MoodleService } from '../services/moodleService';

export function registerResourceTools(server: McpServer): void {
  server.tool(
    'moodle_list_resources',
    'Lists only downloadable materials (PDFs, slides, syllabi, study guides) for a specific course with their corresponding module IDs.',
    {
      courseId: z.number().describe('Numeric ID of the course (e.g. 6708)'),
    },
    async ({ courseId }) => {
      try {
        const moodle = new MoodleService();
        const resources = await moodle.getCourseResources(courseId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ total: resources.length, resources }, null, 2),
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
              text: `Failed to list resources for course ${courseId}: ${message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'moodle_download_resource',
    'Downloads a course learning material (PDF, slide deck, problem set) directly to a specified directory on the local Mac filesystem.',
    {
      cmid: z.number().describe('Numeric module ID of the resource (e.g. 129631)'),
      targetDir: z.string().describe('Absolute local directory where the file should be saved (e.g. /Users/carlos/Downloads)'),
      customFilename: z.string().optional().describe('Optional custom filename. If omitted, the instructor original filename is preserved.'),
    },
    async ({ cmid, targetDir, customFilename }) => {
      try {
        const moodle = new MoodleService();
        const result = await moodle.downloadResourceToFile(cmid, targetDir, customFilename);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, file: result }, null, 2),
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
              text: `Failed to download resource ${cmid}: ${message}`,
            },
          ],
        };
      }
    }
  );
}
