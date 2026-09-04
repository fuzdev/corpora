export type HistoryItem =
	| CatGoHomeHistoryItem
	| CatBeOrDoHistoryItem
	| CatGoAdventureHistoryItem
	| HomeCallCatsHistoryItem
	| AdventureCallCatsHistoryItem;
export interface CatGoHomeHistoryItem {
	type: 'cat_go_home';
	name: string;
}
export interface CatBeOrDoHistoryItem {
	type: 'cat_be_or_do';
	name: string | null;
	position: CatPosition;
}
export interface CatGoAdventureHistoryItem {
	type: 'cat_go_adventure';
	name: string;
}
export interface HomeCallCatsHistoryItem {
	type: 'call_cats_home';
}
export interface AdventureCallCatsHistoryItem {
	type: 'call_cats_adventure';
}

export type CatPosition = 'home' | 'adventure';

export interface Cat {
	name: string;
	icon: string;
	position: CatPosition;
}

export const to_cats_label = (cats: Array<Cat>): string | null => {
	const count = cats.length;
	if (count === 2) return 'cats';
	if (count === 0) return null;
	const cat = cats[0]!;
	return cat.icon + cat.name;
};
