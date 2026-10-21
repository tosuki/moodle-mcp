export interface AssignmentDetails {
  cmid: number;
  title: string;
  submissionStatus: string;
  gradingStatus: string;
  dueDate: string | null;
  timeRemaining: string | null;
  lastModified: string | null;
  submittedFiles: string[];
  onlineText?: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  moodleUrl: string;
}

export interface AssignmentSubmissionOptions {
  cmid: number;
  filePath?: string;
  onlineText?: string;
  confirmFinalSubmission?: boolean;
}

export interface SubmissionResult {
  success: boolean;
  cmid: number;
  title: string;
  message: string;
  submissionStatus: string;
  gradingStatus: string;
  uploadedFiles: string[];
  onlineTextSubmitted: boolean;
  lastModified: string | null;
  timestamp: string;
}
