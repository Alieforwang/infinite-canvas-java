import { http } from "@/api/http";

export type CanvasNode = {
    id: string;
    type: "text" | "image" | "video";
    x: number;
    y: number;
    width: number;
    height: number;
    title?: string;
    content?: string;
    fileNo?: string;
    storageKey?: string;
    taskNo?: string;
};

export type CanvasDocument = {
    nodes: CanvasNode[];
    connections: unknown[];
    viewport: { x: number; y: number; k: number };
    backgroundMode: "lines" | "dots" | "blank";
};

export type ProjectSummary = {
    projectNo: string;
    title: string;
    coverUrl?: string | null;
    nodeCount: number;
    version: number;
    updatedAt: string;
};

export type ProjectDetail = {
    projectNo: string;
    title: string;
    document: CanvasDocument;
    version: number;
    createdAt?: string;
    updatedAt?: string;
};

export function listProjects(): Promise<ProjectSummary[]> {
    return http.get<unknown, ProjectSummary[]>("/canvas-projects");
}

export function createProject(title: string, document: CanvasDocument): Promise<ProjectDetail> {
    return http.post<unknown, ProjectDetail>("/canvas-projects", { title, document });
}

export function getProject(projectNo: string): Promise<ProjectDetail> {
    return http.get<unknown, ProjectDetail>(`/canvas-projects/${projectNo}`);
}

export function updateProject(
    projectNo: string,
    version: number,
    title: string,
    document: CanvasDocument,
): Promise<ProjectDetail> {
    return http.put<unknown, ProjectDetail>(`/canvas-projects/${projectNo}`, { version, title, document });
}

export function deleteProject(projectNo: string): Promise<void> {
    return http.delete<unknown, void>(`/canvas-projects/${projectNo}`);
}

export function emptyDocument(): CanvasDocument {
    return { nodes: [], connections: [], viewport: { x: 0, y: 0, k: 1 }, backgroundMode: "dots" };
}
