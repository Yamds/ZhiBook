// 云端备份状态查询（P15）。动作（备份 / 恢复 / 密钥）通过 `cloudService` 直接调用，
// 完成后用这里导出的失效函数刷新状态卡片。

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cloudService } from '../../core/services/cloud.service';

export const CLOUD_BACKUP_STATE_KEY = ['cloudBackupState'] as const;

export function useCloudBackupState() {
    return useQuery({
        queryKey: CLOUD_BACKUP_STATE_KEY,
        queryFn: () => cloudService.getState(),
        staleTime: 3_000,
        retry: false,
    });
}

export function useInvalidateCloudBackupState() {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: CLOUD_BACKUP_STATE_KEY });
}
