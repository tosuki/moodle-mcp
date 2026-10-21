import { MoodleService } from '../src/services/moodleService';
import fs from 'fs';

async function runIntegrationTest(): Promise<void> {
  console.log('🧪 Starting TypeScript Moodle MCP integration test suite...\n');

  const moodle = new MoodleService();

  // Test 1: Verify Status
  console.log('1. Checking session status...');
  const status = await moodle.getStatus();
  console.log('   ✅ Status result:', status);

  if (!status.authenticated) {
    throw new Error('Integration test requires an active session in ~/.moodle/session.json');
  }

  // Test 2: List Courses
  console.log('\n2. Listing enrolled courses...');
  const courses = await moodle.getEnrolledCourses('all');
  console.log(`   ✅ Enrolled in ${courses.length} courses:`);
  courses.forEach((c) => console.log(`      - [ID ${c.id}] ${c.fullname}`));

  // Test 3: Course Structure
  const targetCourse = courses.find((c) => c.id === 6708) || courses[0];
  console.log(`\n3. Inspecting course syllabus for ID ${targetCourse.id} (${targetCourse.fullname})...`);
  const contents = await moodle.getCourseContents(targetCourse.id);
  console.log('   ✅ Course Stats:', contents.stats);
  console.log(`   ✅ Found ${contents.sections.length} sections.`);

  // Test 4: Resource list
  console.log('\n4. Listing downloadable resources...');
  const resources = await moodle.getCourseResources(targetCourse.id);
  console.log(`   ✅ Found ${resources.length} resource items.`);

  // Test 5: Real file download
  if (resources.length > 0) {
    const targetResource = resources[0];
    console.log(`\n5. Testing file download for: "${targetResource.name}" (cmid ${targetResource.id})...`);
    const tempDir = '/tmp/moodle-ts-test';
    const download = await moodle.downloadResourceToFile(targetResource.id, tempDir);
    console.log('   ✅ Download successful!');
    console.log(`      - Filename: ${download.filename}`);
    console.log(`      - Path: ${download.filePath}`);
    console.log(`      - Size: ${download.sizeBytes} bytes`);
    console.log(`      - Content-Type: ${download.contentType}`);

    if (!fs.existsSync(download.filePath) || fs.statSync(download.filePath).size === 0) {
      throw new Error('Downloaded file is empty or missing from disk.');
    }
  }

  // Test 6: Assignment Status and Details Inspection
  console.log('\n6. Testing assignment status & details inspection (cmid 132724)...');
  const assignmentDetails = await moodle.getAssignmentDetails(132724);
  console.log('   ✅ Assignment details retrieved successfully:');
  console.log(`      - Title: ${assignmentDetails.title}`);
  console.log(`      - Submission Status: ${assignmentDetails.submissionStatus}`);
  console.log(`      - Time Remaining: ${assignmentDetails.timeRemaining}`);
  console.log(`      - Can Edit: ${assignmentDetails.canEdit}`);
  console.log(`      - Can Submit: ${assignmentDetails.canSubmit}`);

  console.log('\n🎉 ALL TYPESCRIPT INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
}

runIntegrationTest().catch((err: unknown) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
