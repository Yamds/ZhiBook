// 添加页（路由入口）：把一次性导航意图翻译成表单模式，然后交给 AddForm。
//
// - 新增：日历点某天进入时带日期（FR-ADD-18）；
// - 编辑（Q3）：明细详情点「编辑」→ `navigateTo('add', { editTransactionId })`，
//   这里先把账单取出来，再以同一份表单渲染；保存 / 取消都回明细页。
//
// 表单本身不关心路由，状态编排全在 `AddForm`（创建 / 编辑共用一份）。

import { useEffect, useState } from 'react';
import { Spinner } from '../../shared/ui';
import { useTransaction } from '../../hooks/ledger';
import { clearNavigationIntent, navigateTo, useNavigation } from '../../app/navigationStore';
import { AddForm } from './AddForm';

export function AddPage() {
    const navigation = useNavigation();
    const [editingId, setEditingId] = useState<string | null>(null);

    const intentEditId = navigation.intent?.editTransactionId ?? null;
    const intentDate = navigation.intent?.date;

    // 消费一次性意图：记下要编辑的账单并清掉意图（避免下次进入被旧参数污染）
    useEffect(() => {
        if (!intentEditId) return;
        setEditingId(intentEditId);
        clearNavigationIntent('add');
    }, [intentEditId, navigation.seq]);

    // 新增模式的日期意图同样是一次性的：转成字符串传下去后清掉
    const passedDate = editingId === null ? intentDate : undefined;
    useEffect(() => {
        if (passedDate === undefined) return;
        clearNavigationIntent('add');
    }, [passedDate, navigation.seq]);

    const { data: editing, isLoading } = useTransaction(editingId ?? undefined);

    if (editingId) {
        if (isLoading) {
            return (
                <div className="flex h-full items-center justify-center">
                    <Spinner size="lg" label="正在读取账单" />
                </div>
            );
        }
        if (!editing) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-[13px] text-text-secondary">这条账单已经不在了</p>
                    <button
                        type="button"
                        onClick={() => navigateTo('details')}
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
                onExit={() => navigateTo('details', { date: editing.day })}
            />
        );
    }

    return <AddForm key="create" editing={null} intentDate={passedDate} />;
}

export default AddPage;
