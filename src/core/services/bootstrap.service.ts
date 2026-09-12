import { invoke, isTauri } from '../ipc/transport';
import type { BootstrapSnapshot } from '../ipc/types';

const mock: BootstrapSnapshot = {
    status: 'ready', schema_version: 1, report: {}, data_root: 'browser-preview/data',
};

export const bootstrapService = {
    async getStatus(): Promise<BootstrapSnapshot> {
        return isTauri ? invoke<BootstrapSnapshot>('get_bootstrap_status') : mock;
    },
    async exportMigrationReport(): Promise<string> {
        return isTauri ? invoke<string>('export_migration_report') : 'browser-preview/migration-report.json';
    },
};
