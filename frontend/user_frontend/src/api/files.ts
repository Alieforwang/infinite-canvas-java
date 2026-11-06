import { http } from "@/api/http";

export type FileView = {
    fileNo: string;
    url: string;
    contentType: string;
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
};

export async function uploadFile(file: File): Promise<FileView> {
    const form = new FormData();
    form.append("file", file);
    return http.post<unknown, FileView>("/files", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300_000,
    });
}

export async function signedUrlOf(fileNo: string): Promise<string> {
    const result = await http.get<unknown, { url: string }>(`/files/${fileNo}/signed-url`);
    return result.url;
}
