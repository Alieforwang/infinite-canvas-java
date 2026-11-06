import { Modal } from "antd";

import { TransferLibrary } from "@/components/works/transfer-library";
import type { CanvasTransferItem } from "@/lib/canvas-transfer";

export type AssetPickerModalProps = {
    open: boolean;
    onClose: () => void;
    onSelect: (items: CanvasTransferItem[]) => void;
};

export function AssetPickerModal({ open, onClose, onSelect }: AssetPickerModalProps) {
    return (
        <Modal open={open} title="从素材与作品添加" width={1000} footer={null} onCancel={onClose} destroyOnHidden>
            {open ? <TransferLibrary onSelect={(items) => { onSelect(items); onClose(); }} /> : null}
        </Modal>
    );
}
