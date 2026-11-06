import { prettyJson } from "../lib/format";

interface JsonBlockProps {
    value: unknown;
    maxHeight?: number;
}

export function JsonBlock({ value, maxHeight }: JsonBlockProps) {
    return (
        <pre className="json-block" style={maxHeight ? { maxHeight } : undefined}>
            {prettyJson(value)}
        </pre>
    );
}
