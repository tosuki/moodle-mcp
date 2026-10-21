export interface CourseSummary {
  id: number;
  fullname: string;
  shortname: string;
  category: string | null;
  progress: number;
  hasProgress: boolean;
  viewUrl: string;
  startDate: string | null;
  endDate: string | null;
}

export interface CourseModule {
  id: number;
  name: string;
  type: string; // 'resource', 'assign', 'quiz', 'forum', 'url', etc.
  modName: string; // 'Arquivo', 'Tarefa', etc.
  plugin: string;
  visible: boolean;
  uservisible: boolean;
  moodleUrl: string;
}

export interface CourseSection {
  id: string;
  sectionNumber: number;
  title: string;
  visible: boolean;
  moduleCount: number;
  modules: CourseModule[];
}

export interface CourseStats {
  totalSections: number;
  totalModules: number;
  totalResources: number;
  totalAssignments: number;
}

export interface CourseContents {
  course: {
    id?: string;
    numSections?: number;
    maxSections?: string;
    baseUrl?: string;
  };
  stats: CourseStats;
  sections: CourseSection[];
}

export interface CourseResourceItem {
  id: number;
  name: string;
  sectionId: string;
  sectionTitle: string;
  moodleUrl: string;
}

export interface DownloadResult {
  filename: string;
  filePath: string;
  sizeBytes: number;
  contentType: string | null;
}
