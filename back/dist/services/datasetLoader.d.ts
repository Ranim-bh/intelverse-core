type DatasetValue = unknown[] | Record<string, unknown>;
export type DatasetsMap = Record<string, DatasetValue>;
export declare const loadDatasets: (forceRefresh?: boolean) => Promise<DatasetsMap>;
export declare const getDatasets: () => DatasetsMap | null;
export declare const loadDataset: (key: string, forceRefresh?: boolean) => Promise<DatasetValue | undefined>;
export {};
//# sourceMappingURL=datasetLoader.d.ts.map