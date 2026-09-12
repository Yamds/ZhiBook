import { useQuery } from '@tanstack/react-query';
import { bootstrapService } from '../../core/services/bootstrap.service';

/// 启动快照（数据根、Schema 版本、迁移报告）。业务页面需要展示
/// “数据在哪 / 迁移是否干净”时用它，不直接调 IPC。
export function useBootstrap() {
    const query = useQuery({ queryKey: ['bootstrap-status'], queryFn: bootstrapService.getStatus });
    return { bootstrap: query.data, isLoading: query.isLoading, error: query.error };
}
