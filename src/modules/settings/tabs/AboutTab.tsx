// 「关于」页签（FR-SET-5 / Q11）：只读的应用信息，不做数据导出。
//
// 版本号 / 包名来自 tauri.conf.json（经 app 插件读取）；浏览器预览下拿不到，
// 显示占位符而不是写死的版本号。

import { useAppInfo } from '../../../hooks/app/useAppInfo';
import { FieldRow, SettingsSection, SettingsTabSections } from '../_shared';

const PLACEHOLDER = '—';

export function AboutTab() {
    const { data, isLoading } = useAppInfo();
    const value = (text: string | undefined) => (
        <span className="text-[13px] tabular-nums text-text-secondary">
            {isLoading ? PLACEHOLDER : text ?? PLACEHOLDER}
        </span>
    );

    return (
        <SettingsTabSections>
            <SettingsSection title="关于" description="只读信息；账单与附件全部保存在本机，不上传云端">
                <FieldRow label="应用名">{value(data?.name)}</FieldRow>
                <FieldRow label="版本号">{value(data?.version)}</FieldRow>
                <FieldRow label="包名" isLast>{value(data?.identifier)}</FieldRow>
            </SettingsSection>
        </SettingsTabSections>
    );
}

export default AboutTab;
