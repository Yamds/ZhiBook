// 应用元信息（应用名 / 版本号 / 包名）。设置页「关于」页签用。

import { useQuery } from '@tanstack/react-query';
import { readAppInfo } from '../../core/services/appInfo.service';

export const APP_INFO_QUERY_KEY = ['app-info'] as const;

export function useAppInfo() {
    return useQuery({
        queryKey: APP_INFO_QUERY_KEY,
        queryFn: readAppInfo,
        // 一次运行内不会变：拉到就一直用（切页签不重新请求）
        staleTime: Infinity,
        gcTime: Infinity,
    });
}
