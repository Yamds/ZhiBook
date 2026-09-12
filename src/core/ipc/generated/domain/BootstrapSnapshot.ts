export type BootstrapSnapshot = {
    status: 'ready' | 'migrating' | 'repair_required' | 'failed';
    schema_version: number;
    report: unknown;
    data_root: string;
};
