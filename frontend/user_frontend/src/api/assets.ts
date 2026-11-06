import { http } from "@/api/http";
import type { PageResult } from "@/api/video-tasks";

export type AssetKind = "video" | "image" | "text";

export type AssetView = {
    assetNo: string;
    kind: AssetKind;
    title: string;
    file?: { fileNo: string; url: string; contentType: string; bytes?: number; width?: number; height?: number } | null;
    coverUrl?: string | null;
    textContent?: string | null;
    tags: string[];
    source?: string;
    note?: string;
    metadata?: Record<string, unknown> | null;
    createdAt?: string;
    updatedAt?: string;
};

export type AssetInput = {
    kind: AssetKind;
    title?: string;
    fileNo?: string;
    textContent?: string;
    tags?: string[];
    source?: string;
    note?: string;
    metadata?: Record<string, unknown>;
};

export function listAssets(input: {
    kind?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
}): Promise<PageResult<AssetView>> {
    return http.get<unknown, PageResult<AssetView>>("/assets", {
        params: {
            kind: input.kind && input.kind !== "all" ? input.kind : undefined,
            keyword: input.keyword || undefined,
            page: input.page ?? 1,
            pageSize: input.pageSize ?? 12,
        },
    });
}

export function createAsset(input: AssetInput): Promise<AssetView> {
    return http.post<unknown, AssetView>("/assets", input);
}

export function updateAsset(assetNo: string, input: Partial<AssetInput>): Promise<AssetView> {
    return http.put<unknown, AssetView>(`/assets/${assetNo}`, input);
}

export function deleteAsset(assetNo: string): Promise<void> {
    return http.delete<unknown, void>(`/assets/${assetNo}`);
}
