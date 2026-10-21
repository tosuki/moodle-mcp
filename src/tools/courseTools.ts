import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MoodleService } from '../services/moodleService';

export function registerCourseTools(server: McpServer): void {
  server.tool(
    'moodle_list_courses',
    'Lists all academic courses in which the student is enrolled (including course IDs, official subject names, schedules/shifts, and progress).',
    {
      classification: z
        .enum(['all', 'inprogress', 'past', 'future'])
        .optional()
        .describe('Course classification filter (default: all)'),
    },
    async ({ classification }) => {
      try {
        const moodle = new MoodleService();
        const courses = await moodle.getEnrolledCourses(classification || 'all');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ total: courses.length, courses }, null, 2),
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
              text: `Failed to list enrolled courses: ${message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    'moodle_get_course_details',
    'Retrieves the full syllabus and structure of a course, including all sections/tiles, lectures, assignments, questionnaires, and attached materials.',
    {
      courseId: z.number().describe('Numeric ID of the course (e.g. 6708)'),
    },
    async ({ courseId }) => {
      try {
        const moodle = new MoodleService();
        const contents = await moodle.getCourseContents(courseId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(contents, null, 2),
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
              text: `Failed to fetch course details for ID ${courseId}: ${message}`,
            },
          ],
        };
      }
    }
  );
}
