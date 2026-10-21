import fs from 'fs';
import path from 'path';
import { SessionStore } from '../storage/sessionStore';
import { DEFAULT_BASE_URL, DEFAULT_USER_AGENT } from '../config/constants';
import {
  CourseContents,
  CourseModule,
  CourseResourceItem,
  CourseSection,
  CourseSummary,
  DownloadResult,
} from '../types/course';
import {
  AssignmentDetails,
  AssignmentSubmissionOptions,
  SubmissionResult,
} from '../types/assignment';
import { SessionStatus } from '../types/session';

export interface MoodleServiceOptions {
  baseUrl?: string;
  session?: string;
  sesskey?: string;
  userAgent?: string;
}

export class MoodleService {
  private baseUrl: string;
  private session: string | null;
  private sesskey: string | null;
  private userAgent: string;

  constructor(options: MoodleServiceOptions = {}) {
    const saved = SessionStore.load();
    this.baseUrl = (options.baseUrl || saved?.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.session = options.session || saved?.session || null;
    this.sesskey = options.sesskey || saved?.sesskey || null;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
  }

  private getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.session) {
      throw new Error('No active Moodle session found. Please run the `moodle_login` tool to authenticate.');
    }
    return {
      Cookie: `MoodleSession=${this.session}`,
      'User-Agent': this.userAgent,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      ...extra,
    };
  }

  public async ensureSesskey(): Promise<string> {
    if (this.sesskey) {
      return this.sesskey;
    }

    const res = await fetch(`${this.baseUrl}/my/courses.php`, {
      headers: this.getHeaders({ Accept: 'text/html' }),
    });

    if (!res.ok) {
      throw new Error(`Failed to access Moodle dashboard (HTTP ${res.status}). Session may have expired.`);
    }

    const html = await res.text();

    if (html.includes('login/index.php') || html.includes('auth/oidc')) {
      throw new Error('Moodle session has expired. Please run the `moodle_login` tool to re-authenticate.');
    }

    const sesskeyMatch = html.match(/sesskey=([a-zA-Z0-9]+)/) || html.match(/"sesskey":"([a-zA-Z0-9]+)"/);
    if (!sesskeyMatch) {
      throw new Error('Unable to extract Moodle sesskey from the active session.');
    }

    this.sesskey = sesskeyMatch[1];
    return this.sesskey!;
  }

  public async getStatus(): Promise<SessionStatus> {
    if (!this.session) {
      return {
        authenticated: false,
        message: 'No session credentials stored. Please invoke `moodle_login` to authenticate.',
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/my/courses.php`, {
        headers: this.getHeaders({ Accept: 'text/html' }),
        redirect: 'manual',
      });

      if (res.status === 302 || res.status === 303 || res.status === 401) {
        return {
          authenticated: false,
          message: 'Session has expired or been revoked. Please run `moodle_login`.',
        };
      }

      const html = await res.text();
      if (html.includes('login/index.php') || html.includes('auth/oidc')) {
        return {
          authenticated: false,
          message: 'Session has expired. Please run `moodle_login`.',
        };
      }

      const saved = SessionStore.load();
      const sesskey = await this.ensureSesskey();

      return {
        authenticated: true,
        user: saved?.user ?? null,
        sesskey,
        updatedAt: saved?.updatedAt,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        authenticated: false,
        message: `Failed to verify session status: ${message}`,
      };
    }
  }

  public async callAjax<T = unknown>(methodname: string, args: Record<string, unknown> = {}, info?: string): Promise<T> {
    await this.ensureSesskey();

    const queryInfo = encodeURIComponent(info || methodname);
    const url = `${this.baseUrl}/lib/ajax/service.php?sesskey=${this.sesskey}&info=${queryInfo}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      }),
      body: JSON.stringify([{ index: 0, methodname, args }]),
    });

    if (!res.ok) {
      throw new Error(`Moodle internal AJAX request failed with HTTP ${res.status}`);
    }

    const json = (await res.json()) as Array<{
      error: boolean;
      data: unknown;
      exception?: { message?: string; errorcode?: string };
    }>;

    if (!Array.isArray(json) || json.length === 0) {
      throw new Error('Unexpected response format received from Moodle AJAX service.');
    }

    const result = json[0];
    if (result.error) {
      const errorMsg = result.exception?.message || 'Unknown Moodle service exception';
      const errorCode = result.exception?.errorcode || 'error';
      throw new Error(`Moodle API Error [${errorCode}]: ${errorMsg}`);
    }

    if (typeof result.data === 'string') {
      try {
        return JSON.parse(result.data) as T;
      } catch {
        return result.data as T;
      }
    }

    return result.data as T;
  }

  public async getEnrolledCourses(classification: 'all' | 'inprogress' | 'past' | 'future' = 'all'): Promise<CourseSummary[]> {
    interface TimelineResponse {
      courses: Array<{
        id: number;
        fullname: string;
        shortname: string;
        coursecategory?: string;
        progress?: number;
        hasprogress?: boolean;
        viewurl: string;
        startdate?: number;
        enddate?: number;
      }>;
    }

    const data = await this.callAjax<TimelineResponse>('core_course_get_enrolled_courses_by_timeline_classification', {
      offset: 0,
      limit: 0,
      classification,
      sort: 'ul.timeaccess desc',
      customfieldname: '',
      customfieldvalue: '',
      requiredfields: ['id', 'fullname', 'shortname', 'showcoursecategory', 'showshortname', 'visible', 'enddate'],
    });

    const courses = data?.courses ?? [];
    return courses.map((c) => ({
      id: c.id,
      fullname: c.fullname,
      shortname: c.shortname,
      category: c.coursecategory || null,
      progress: c.progress || 0,
      hasProgress: !!c.hasprogress,
      viewUrl: c.viewurl,
      startDate: c.startdate ? new Date(c.startdate * 1000).toISOString() : null,
      endDate: c.enddate ? new Date(c.enddate * 1000).toISOString() : null,
    }));
  }

  public async getCourseContents(courseId: number): Promise<CourseContents> {
    interface CourseFormatState {
      course?: {
        id?: string;
        numsections?: number;
        maxsections?: string;
        baseurl?: string;
      };
      section?: Array<{
        id: string;
        section: number;
        title?: string;
        visible: boolean;
        cmlist?: string[];
      }>;
      cm?: Array<{
        id: number;
        name: string;
        module: string;
        modname: string;
        plugin: string;
        visible: boolean;
        uservisible: boolean;
        url: string;
      }>;
    }

    const state = await this.callAjax<CourseFormatState>('core_courseformat_get_state', {
      courseid: courseId,
    });

    const sectionsRaw = state.section ?? [];
    const cmRaw = state.cm ?? [];

    const cmMap = new Map<string, CourseModule>();
    for (const cm of cmRaw) {
      cmMap.set(String(cm.id), {
        id: cm.id,
        name: cm.name,
        type: cm.module,
        modName: cm.modname,
        plugin: cm.plugin,
        visible: cm.visible,
        uservisible: cm.uservisible,
        moodleUrl: cm.url,
      });
    }

    const sections: CourseSection[] = sectionsRaw.map((s) => {
      const cmlist = s.cmlist ?? [];
      const modules = cmlist
        .map((cmId) => cmMap.get(String(cmId)))
        .filter((mod): mod is CourseModule => Boolean(mod));

      return {
        id: s.id,
        sectionNumber: s.section,
        title: s.title || (s.section === 0 ? 'General' : `Section ${s.section}`),
        visible: s.visible,
        moduleCount: modules.length,
        modules,
      };
    });

    const allModules = Array.from(cmMap.values());
    const resources = allModules.filter((m) => m.type === 'resource');
    const assignments = allModules.filter((m) => m.type === 'assign');

    return {
      course: {
        id: state.course?.id,
        numSections: state.course?.numsections,
        maxSections: state.course?.maxsections,
        baseUrl: state.course?.baseurl,
      },
      stats: {
        totalSections: sections.length,
        totalModules: allModules.length,
        totalResources: resources.length,
        totalAssignments: assignments.length,
      },
      sections,
    };
  }

  public async getCourseResources(courseId: number): Promise<CourseResourceItem[]> {
    const contents = await this.getCourseContents(courseId);
    const resources: CourseResourceItem[] = [];

    for (const section of contents.sections) {
      for (const mod of section.modules) {
        if (mod.type === 'resource') {
          resources.push({
            id: mod.id,
            name: mod.name,
            sectionId: section.id,
            sectionTitle: section.title,
            moodleUrl: mod.moodleUrl,
          });
        }
      }
    }

    return resources;
  }

  public async downloadResourceToFile(cmid: number, targetDir: string, customFilename?: string): Promise<DownloadResult> {
    const url = `${this.baseUrl}/mod/resource/view.php?id=${cmid}&redirect=1`;
    const res = await fetch(url, {
      headers: this.getHeaders({ Accept: '*/*' }),
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`Failed to download file from Moodle (HTTP ${res.status})`);
    }

    let filename = customFilename;
    if (!filename) {
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1].trim());
        }
      }
      if (!filename) {
        try {
          const parsedUrl = new URL(res.url);
          const pathname = decodeURIComponent(parsedUrl.pathname);
          filename = path.basename(pathname);
        } catch {}
      }
      if (!filename || filename === 'view.php') {
        filename = `resource_${cmid}.pdf`;
      }
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, filename);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    return {
      filename,
      filePath,
      sizeBytes: buffer.length,
      contentType: res.headers.get('content-type'),
    };
  }

  public async getAssignmentDetails(cmid: number): Promise<AssignmentDetails> {
    const url = `${this.baseUrl}/mod/assign/view.php?id=${cmid}`;
    const res = await fetch(url, {
      headers: this.getHeaders({ Accept: 'text/html' }),
    });

    if (!res.ok) {
      throw new Error(`Failed to load assignment page (HTTP ${res.status}) for ID ${cmid}`);
    }

    const html = await res.text();
    if (html.includes('login/index.php') || html.includes('auth/oidc')) {
      throw new Error('Moodle session has expired. Please run moodle_login.');
    }

    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let title = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
    if (!title) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      title = titleMatch ? titleMatch[1].trim() : `Assignment ${cmid}`;
    }

    const rowRegex = /<tr[^>]*>[\s\S]*?<th[^>]*class="[^"]*cell[^"]*c0[^"]*"[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*class="[^"]*cell[^"]*c1[^"]*"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
    const tableData: Record<string, string> = {};
    let m: RegExpExecArray | null;
    while ((m = rowRegex.exec(html)) !== null) {
      const key = m[1].replace(/<[^>]+>/g, '').trim();
      const val = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      tableData[key] = val;
    }

    const submittedFiles: string[] = [];
    const filesSection =
      html.match(/class="[^"]*assignsubmission_file[^"]*"[\s\S]*?<\/div>/i) ||
      html.match(/Envios de arquivo[\s\S]*?<\/td>/i);
    if (filesSection) {
      const fileLinkMatches = filesSection[0].match(/<a[^>]+>([^<]+)<\/a>/gi);
      if (fileLinkMatches) {
        for (const link of fileLinkMatches) {
          const text = link.replace(/<[^>]+>/g, '').trim();
          if (text && !text.includes('Mostrar comentários')) {
            submittedFiles.push(text);
          }
        }
      }
    }

    const submissionStatus =
      tableData['Status de envio'] || tableData['Submission status'] || 'Nenhum envio feito';
    const gradingStatus =
      tableData['Status da avaliação'] || tableData['Grading status'] || 'Não há notas';
    const dueDate = tableData['Data de entrega'] || tableData['Due date'] || null;
    const timeRemaining = tableData['Tempo restante'] || tableData['Time remaining'] || null;
    const lastModified = tableData['Última modificação'] || tableData['Last modified'] || null;

    const canEdit =
      html.includes('action=editsubmission') ||
      html.includes('Adicionar envio') ||
      html.includes('Editar envio');
    const canSubmit =
      html.includes('action=submit') || html.includes('Enviar tarefa em definitivo');

    return {
      cmid,
      title,
      submissionStatus,
      gradingStatus,
      dueDate,
      timeRemaining,
      lastModified,
      submittedFiles,
      onlineText: tableData['Texto online'] || tableData['Online text'] || null,
      canEdit,
      canSubmit,
      moodleUrl: url,
    };
  }

  public async submitAssignment(options: AssignmentSubmissionOptions): Promise<SubmissionResult> {
    const { cmid, filePath, onlineText, confirmFinalSubmission } = options;

    if (!filePath && (onlineText === undefined || onlineText === null)) {
      throw new Error('At least one submission content (filePath or onlineText) must be provided.');
    }

    if (filePath && !fs.existsSync(filePath)) {
      throw new Error(`File not found at specified path: ${filePath}`);
    }

    await this.ensureSesskey();

    const editUrl = `${this.baseUrl}/mod/assign/view.php?id=${cmid}&action=editsubmission`;
    const editRes = await fetch(editUrl, {
      headers: this.getHeaders({ Accept: 'text/html' }),
    });

    if (!editRes.ok) {
      throw new Error(`Failed to access assignment submission form (HTTP ${editRes.status}).`);
    }

    const html = await editRes.text();
    if (html.includes('login/index.php') || html.includes('auth/oidc')) {
      throw new Error('Moodle session has expired. Please run moodle_login.');
    }

    if (
      !html.includes('action="savesubmission"') &&
      !html.includes('action=savesubmission') &&
      !html.includes('name="action" value="savesubmission"')
    ) {
      const alertMatch = html.match(/class="[^"]*alert[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const reason = alertMatch
        ? alertMatch[1].replace(/<[^>]+>/g, '').trim()
        : 'Submission is closed, locked, or not permitted for this assignment.';
      throw new Error(`Cannot submit assignment (ID ${cmid}): ${reason}`);
    }

    const formInputRegex = /<input\s+([^>]*?)>/gi;
    const formInputs: Record<string, string> = {};
    let inputMatch: RegExpExecArray | null;
    while ((inputMatch = formInputRegex.exec(html)) !== null) {
      const attrs = inputMatch[1];
      const nameM = attrs.match(/name=["']([^"']+)["']/i);
      const valM = attrs.match(/value=["']([^"']*)["']/i);
      if (nameM) {
        formInputs[nameM[1]] = valM ? valM[1] : '';
      }
    }

    const uploadedFiles: string[] = [];
    if (filePath) {
      const fmMatch = html.match(/M\.form_filemanager\.init\(Y,\s*(\{[\s\S]*?\})\);/);
      if (!fmMatch) {
        throw new Error(
          `Assignment ${cmid} does not accept file submissions (filemanager element not found).`
        );
      }

      let fmConfig: any;
      try {
        fmConfig = JSON.parse(fmMatch[1]);
      } catch {
        throw new Error('Failed to parse Moodle filemanager configuration.');
      }

      const fileBuffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);

      if (
        fmConfig.maxbytes &&
        Number(fmConfig.maxbytes) > 0 &&
        fileBuffer.length > Number(fmConfig.maxbytes)
      ) {
        throw new Error(
          `File size (${fileBuffer.length} bytes) exceeds assignment limit (${fmConfig.maxbytes} bytes).`
        );
      }

      const formData = new FormData();
      const blob = new Blob([fileBuffer]);
      formData.append('repo_upload_file', blob, fileName);
      formData.append('itemid', String(fmConfig.itemid));
      formData.append('repo_id', '5');
      formData.append('env', 'filemanager');
      formData.append('sesskey', this.sesskey!);
      formData.append('client_id', fmConfig.client_id || 'upload_client');
      formData.append('savepath', '/');
      formData.append('ctx_id', String(fmConfig.context?.id || 1));
      formData.append('title', fileName);
      formData.append('author', fmConfig.author || (SessionStore.load()?.user?.name ?? 'Student'));
      formData.append('license', 'unknown');

      const uploadUrl = `${this.baseUrl}/repository/repository_ajax.php?action=upload`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Repository upload failed with HTTP ${uploadRes.status}`);
      }

      const uploadJson = (await uploadRes.json()) as any;
      if (uploadJson.error) {
        throw new Error(`File upload error: ${uploadJson.error}`);
      }

      formInputs['files_filemanager'] = String(fmConfig.itemid);
      uploadedFiles.push(fileName);
    }

    if (onlineText !== undefined && onlineText !== null) {
      formInputs['onlinetext_editor[text]'] = onlineText;
      formInputs['onlinetext_editor[format]'] = '1';
    }

    formInputs['id'] = String(cmid);
    formInputs['action'] = 'savesubmission';
    formInputs['sesskey'] = this.sesskey!;
    formInputs['_qf__mod_assign_submission_form'] = '1';
    formInputs['submitbutton'] = 'Salvar mudanças';

    if (html.includes('name="submissionstatement"')) {
      formInputs['submissionstatement'] = '1';
    }

    const postBody = new URLSearchParams();
    for (const [key, value] of Object.entries(formInputs)) {
      postBody.append(key, value);
    }

    const saveRes = await fetch(`${this.baseUrl}/mod/assign/view.php`, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: postBody.toString(),
      redirect: 'follow',
    });

    if (!saveRes.ok) {
      throw new Error(`Failed to save assignment submission (HTTP ${saveRes.status})`);
    }

    if (confirmFinalSubmission) {
      const verifyRes = await fetch(`${this.baseUrl}/mod/assign/view.php?id=${cmid}`, {
        headers: this.getHeaders({ Accept: 'text/html' }),
      });
      const verifyHtml = await verifyRes.text();

      if (verifyHtml.includes('action=submit') || verifyHtml.includes('name="action" value="submit"')) {
        const confirmPageRes = await fetch(
          `${this.baseUrl}/mod/assign/view.php?id=${cmid}&action=submit`,
          {
            headers: this.getHeaders({ Accept: 'text/html' }),
          }
        );
        const confirmHtml = await confirmPageRes.text();

        const confirmBody = new URLSearchParams();
        confirmBody.append('id', String(cmid));
        confirmBody.append('action', 'submitconfirmsubmission');
        confirmBody.append('sesskey', this.sesskey!);
        if (confirmHtml.includes('name="submissionstatement"')) {
          confirmBody.append('submissionstatement', '1');
        }
        confirmBody.append('confirm', '1');

        await fetch(`${this.baseUrl}/mod/assign/view.php`, {
          method: 'POST',
          headers: this.getHeaders({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: confirmBody.toString(),
          redirect: 'follow',
        });
      }
    }

    const finalDetails = await this.getAssignmentDetails(cmid);

    return {
      success: true,
      cmid,
      title: finalDetails.title,
      message: `Assignment successfully saved with status: "${finalDetails.submissionStatus}"`,
      submissionStatus: finalDetails.submissionStatus,
      gradingStatus: finalDetails.gradingStatus,
      uploadedFiles:
        finalDetails.submittedFiles.length > 0 ? finalDetails.submittedFiles : uploadedFiles,
      onlineTextSubmitted: onlineText !== undefined && onlineText !== null,
      lastModified: finalDetails.lastModified,
      timestamp: new Date().toISOString(),
    };
  }
}
