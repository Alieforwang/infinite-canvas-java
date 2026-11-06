import { Button } from "antd";
import { Copy } from "lucide-react";

import { useFeedback } from "../lib/feedback";

interface CopyButtonProps {
    text: string;
    label?: string;
    size?: "small" | "middle";
    block?: boolean;
}

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // 回退到 execCommand
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

export function CopyButton({ text, label = "复制", size = "small", block = false }: CopyButtonProps) {
    const { message } = useFeedback();
    return (
        <Button
            size={size}
            block={block}
            icon={<Copy size={14} />}
            onClick={async () => {
                const ok = await copyText(text);
                if (ok) {
                    message.success("已复制到剪贴板");
                } else {
                    message.error("复制失败，请手动选择复制");
                }
            }}
        >
            {label}
        </Button>
    );
}
