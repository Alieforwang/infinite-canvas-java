import { useEffect, type ReactNode } from "react";
import { Alert, Button, Spin } from "antd";
import { usePublicSettingsStore } from "@/stores/use-public-settings-store";

export function PublicSettingsGate({ children }: { children: ReactNode }) {
    const initialized = usePublicSettingsStore((state) => state.initialized);
    const error = usePublicSettingsStore((state) => state.error);
    const load = usePublicSettingsStore((state) => state.load);
    useEffect(() => { void load(); }, [load]);
    if (!initialized) return (
        <div className="flex h-dvh items-center justify-center">
            {error ? <Alert type="error" showIcon title={error} action={<Button onClick={() => void load()}>重新加载</Button>} /> : <Spin description="加载计费配置…" />}
        </div>
    );
    return children;
}
