export type DatasetsMap = Record<string, unknown[] | Record<string, unknown>>;
export declare const loadDatasets: (forceRefresh?: boolean) => Promise<DatasetsMap>;
export declare const getDatasets: () => DatasetsMap | null;
export declare const loadDataset: (key: string, forceRefresh?: boolean) => Promise<unknown[] | Record<string, unknown> | undefined>;
//# sourceMappingURL=datasetLoader.d.ts.map