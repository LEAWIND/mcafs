export type IndexdObject = {
	hash: string;
	size: number;
};

export type IndexJson = {
	map_to_resources?: boolean;
	objects: {
		[key: string]: IndexdObject;
	};
};
