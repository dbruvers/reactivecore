import XDate from 'xdate';
import { componentTypes, queryTypes } from './constants';
import { formatDate } from './helper';

const componentToTypeMap = {
	// search components
	[componentTypes.reactiveList]: queryTypes.search,
	[componentTypes.dataSearch]: queryTypes.search,
	[componentTypes.categorySearch]: queryTypes.search,
	// term components
	[componentTypes.singleList]: queryTypes.term,
	[componentTypes.multiList]: queryTypes.term,
	[componentTypes.singleDataList]: queryTypes.term,
	[componentTypes.singleDropdownList]: queryTypes.term,
	[componentTypes.multiDataList]: queryTypes.term,
	[componentTypes.multiDropdownList]: queryTypes.term,
	[componentTypes.singleDropdownRange]: queryTypes.term,
	[componentTypes.tagCloud]: queryTypes.term,
	[componentTypes.toggleButton]: queryTypes.term,
	// basic components
	[componentTypes.numberBox]: queryTypes.term,

	// range components
	[componentTypes.datePicker]: queryTypes.range,
	[componentTypes.dateRange]: queryTypes.range,
	[componentTypes.dynamicRangeSlider]: queryTypes.range,
	[componentTypes.multiDropdownRange]: queryTypes.range,
	[componentTypes.singleRange]: queryTypes.range,
	[componentTypes.multiRange]: queryTypes.range,
	[componentTypes.rangeSlider]: queryTypes.range,
	[componentTypes.ratingsFilter]: queryTypes.range,
	[componentTypes.rangeInput]: queryTypes.range,
};

const multiRangeComponents = [componentTypes.multiRange, componentTypes.multiDropdownRange];
const dateRangeComponents = [componentTypes.dateRange, componentTypes.datePicker];

export const getNormalizedField = (field) => {
	if (field && field.constructor !== Array) {
		return [field];
	}
	return field;
};

export const isInternalComponent = (componentID = '') => componentID.endsWith('__internal');

export const getInternalComponentID = (componentID = '') => `${componentID}__internal`;

export const getHistogramComponentID = (componentID = '') => `${componentID}__histogram__internal`;

export const isDRSRangeComponent = (componentID = '') => componentID.endsWith('__range__internal');

export const getRSQuery = (componentId, props, execute = true) => {
	if (props && componentId && props.dataField) {
		return {
			id: componentId,
			type: props.type ? props.type : componentToTypeMap[props.componentType],
			dataField: getNormalizedField(props.dataField),
			execute,
			react: props.react,
			highlight: props.highlight,
			highlightField: getNormalizedField(props.highlightField),
			fuzziness: props.fuzziness,
			searchOperators: props.searchOperators,
			includeFields: props.includeFields,
			excludeFields: props.excludeFields,
			size: props.size,
			from: props.from, // Need to maintain for RL
			queryFormat: props.queryFormat,
			sortBy: props.sortBy,
			fieldWeights: getNormalizedField(props.fieldWeights),
			includeNullValues: props.includeNullValues,
			aggregationField: props.aggregationField,
			categoryField: props.categoryField,
			missingLabel: props.missingLabel,
			showMissing: props.showMissing,
			nestedField: props.nestedField,
			interval: props.interval,
			customHighlight: props.customHighlight,
			customQuery: props.customQuery,
			defaultQuery: props.defaultQuery,
			value: props.value,
			categoryValue: props.categoryValue || undefined,
			after: props.after || undefined,
			aggregations: props.aggregations || undefined,
		};
	}
	return null;
};


export const getValidInterval = (interval, range = {}) => {
	const min = Math.ceil((range.end - range.start) / 100) || 1;
	if (!interval) {
		return min;
	} else if (interval < min) {
		return min;
	}
	return interval;
};

export const extractPropsFromState = (store, component, customOptions) => {
	const componentProps = store.props[component];
	const queryType = componentToTypeMap[componentProps.componentType];
	const calcValues = store.selectedValues[component] || store.internalValues[component];
	let compositeAggregationField = componentProps.aggregationField;
	let value = calcValues !== undefined && calcValues !== null ? calcValues.value : undefined;
	let queryFormat = componentProps.queryFormat;
	let { interval } = componentProps;
	let type = componentToTypeMap[componentProps.componentType];
	let dataField = componentProps.dataField;
	let aggregations;

	// For term queries i.e list component `dataField` will be treated as aggregationField
	if (queryType === queryTypes.term) {
		compositeAggregationField = componentProps.dataField;
		// Remove selectAllLabel value
		if (componentProps.selectAllLabel) {
			if (typeof value === 'string' && value === componentProps.selectAllLabel) {
				value = '';
			} else if (Array.isArray(value)) {
				value = value.filter(val => val !== componentProps.selectAllLabel);
			}
		}
	}
	if (queryType === queryTypes.range) {
		if (Array.isArray(value)) {
			if (multiRangeComponents.includes(componentProps.componentType)) {
				value = value.map(({ start, end }) => ({
					start,
					end,
				}));
			} else {
				value = {
					start: value[0],
					end: value[1],
				};
			}
		} else if (componentProps.showHistogram) {
			const internalComponentID = getInternalComponentID(component);
			let internalComponentValue = store.internalValues[internalComponentID];
			if (!internalComponentValue) {
				// Handle dynamic range slider
				const histogramComponentID = getHistogramComponentID(component);
				internalComponentValue = store.internalValues[histogramComponentID];
			}
			if (internalComponentValue && Array.isArray(internalComponentValue.value)) {
				value = {
					start: internalComponentValue.value[0],
					end: internalComponentValue.value[1],
				};
				// Set interval
				interval = getValidInterval(interval, value);
			}
		}
		if (isDRSRangeComponent(component)) {
			aggregations = ['min', 'max'];
		} else if (componentProps.showHistogram) {
			aggregations = ['histogram'];
		}

		// handle date components
		if (dateRangeComponents.includes(componentProps.componentType)) {
			// Remove query format for `date` components
			queryFormat = 'or';
			// Set value
			if (value) {
				if (typeof value === 'string') {
					value = {
						start: formatDate(new XDate(value).addHours(-24), componentProps),
						end: formatDate(new XDate(value), componentProps),
					};
				} else if (Array.isArray(value)) {
					value = value.map(val => ({
						start: formatDate(new XDate(val).addHours(-24), componentProps),
						end: formatDate(new XDate(val), componentProps),
					}));
				}
			}
		}
	}
	// handle number box, number box query changes based on the `queryFormat` value
	if (componentProps.componentType === componentTypes.numberBox) {
		if (queryFormat === 'exact') {
			type = 'term';
		} else {
			type = 'range';
			if (queryFormat === 'lte') {
				value = {
					end: value,
					boost: 2.0,
				};
			} else {
				value = {
					start: value,
					boost: 2.0,
				};
			}
		}
		// Remove query format
		queryFormat = 'or';
	}
	// Fake dataField for ReactiveComponent
	if (componentProps.componentType === componentTypes.reactiveComponent) {
		dataField = 'reactive_component_field';
	}
	return {
		...componentProps,
		dataField,
		queryFormat,
		type,
		aggregations,
		interval,
		react: store.dependencyTree[component],
		customQuery: store.customQueries[component],
		defaultQuery: store.defaultQueries[component],
		customHighlight: store.customHighlightOptions[component],
		categoryValue: store.internalValues[component]
			? store.internalValues[component].category
			: undefined,
		value,
		after:
			store.aggregations[component]
			&& store.aggregations[component][compositeAggregationField]
			&& store.aggregations[component][compositeAggregationField].after_key,
		...customOptions,
	};
};

export function flatReactProp(reactProp) {
	let flattenReact = [];
	const flatReact = (react) => {
		if (react && Object.keys(react)) {
			Object.keys(react).forEach((r) => {
				if (react[r]) {
					if (typeof react[r] === 'string') {
						flattenReact = [...flattenReact, react[r]];
					} else if (Array.isArray(react[r])) {
						flattenReact = [...flattenReact, ...react[r]];
					} else if (typeof react[r] === 'object') {
						flatReact(react[r]);
					}
				}
			});
		}
	};
	flatReact(reactProp);
	return flattenReact;
}

export const getDependentQueries = (store, componentID) => {
	const finalQuery = {};
	const addDependentQueries = (react = []) => {
		react.forEach((component) => {
			const calcValues = store.selectedValues[component] || store.internalValues[component];
			// Only apply component that has some value
			if (calcValues && !finalQuery[component]) {
				// build query
				const dependentQuery = getRSQuery(
					component,
					extractPropsFromState(store, component),
					false,
				);
				if (dependentQuery) {
					finalQuery[component] = dependentQuery;
				}
			}
			const componentReactDependency = store.dependencyTree[component];
			if (componentReactDependency) {
				const flattenReact = flatReactProp(componentReactDependency);
				if (flattenReact.length) {
					addDependentQueries(flattenReact, store, finalQuery);
				}
			}
		});
	};
	addDependentQueries(flatReactProp(store.dependencyTree[componentID]), store);
	return finalQuery;
};
