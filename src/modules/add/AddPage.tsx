// 添加页（路由入口）：把一次性导航意图翻译成表单模式，然后交给 AddForm。
//
// - 新增：日历点某天进入时带日期（FR-ADD-18）；
// - 编辑（Q3）：明细详情点「编辑」→ `navigateTo('add', { editTransactionId, restoreAnchorDay })`，
//   这里先把账单取出来，再以同一份表单渲染；保存 / 取消都回明细页。
//   `restoreAnchorDay` 是明细页当时选中的日期，回程会原样带回去——用户的选择器位置不因为
//   编辑了一条更早日期的账单而跳走（编辑保存后还要定位并高亮那条账单）。
//
// 表单本身不关心路由，状态编排全在 `AddForm`（创建 / 编辑共用一份）。

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../shared/ui';
import { useTransaction } from '../../hooks/ledger';
import {
    clearNavigationIntent,
    navigateTo,
    useNavigation,
    type NavigationIntent,
} from '../../app/navigationStore';
import { AddForm, type AddFormExit } from './AddForm';

export function AddPage() {
    const { t } = useTranslation();
    const navigation = useNavigation();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [restoreAnchorDay, setRestoreAnchorDay] = useState<string | null>(null);

    const intentEditId = navigation.intent?.editTransactionId ?? null;
    const intentDate = navigation.intent?.date;

    // 消费一次性意图：记下要编辑的账单与「回程锚定日」并清掉意图
    useEffect(() => {
        if (!intentEditId) return;
        setEditingId(intentEditId);
        setRestoreAnchorDay(navigation.intent?.restoreAnchorDay ?? null);
        clearNavigationIntent('add');
    }, [intentEditId, navigation.seq, navigation.intent]);

    // 新增模式的日期意图同样是一次性的：转成字符串传下去后清掉
    const passedDate = editingId === null ? intentDate : undefined;
    useEffect(() => {
        if (passedDate === undefined) return;
        clearNavigationIntent('add');
    }, [passedDate, navigation.seq]);

    const { data: editing, isLoading } = useTransaction(editingId ?? undefined);

    /** 回明细页：原样带回锚定日；保存成功时额外带上要定位高亮的账单。 */
    const backToDetails = useCallback(
        (exit?: AddFormExit, focusDay?: string) => {
            const intent: NavigationIntent = {};
            if (restoreAnchorDay) intent.restoreAnchorDay = restoreAnchorDay;
            if (exit?.focusTransactionId) {
                intent.focusTransactionId = exit.focusTransactionId;
                intent.focusDay = focusDay;
            }
            navigateTo('details', Object.keys(intent).length > 0 ? intent : undefined);
        },
        [restoreAnchorDay],
    );

    if (editingId) {
        if (isLoading) {
            return (
                <div className="flex h-full items-center justify-center">
                    <Spinner size="lg" label={t('add.loadingEntry')} />
                </div>
            );
        }
        if (!editing) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-[13px] text-text-secondary">{t('add.entryGone')}</p>
                    <button
                        type="button"
                        onClick={() => backToDetails()}
                        className="h-9 rounded-pill bg-brand px-4 text-[13px] font-semibold text-white active:opacity-90"
                    >
                        返回明细
                    </button>
                </div>
            );
        }
        return (
            <AddForm
                key={editing.id}
                editing={editing}
                onExit={(exit) => backToDetails(exit, editing.day)}
            />
        );
    }

    return <AddForm key="create" editing={null} intentDate={passedDate} />;
}

export default AddPage;
