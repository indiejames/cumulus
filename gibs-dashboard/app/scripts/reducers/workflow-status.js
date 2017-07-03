/**
 * Handles fetching and saving the workflow status in the state. Workflow status the name, and
 * execution dates of the workflows.
 */
const { Map, List, Set } = require('immutable');
const api = require('../ops-api');
const { errorAction } = require('./errors');

// Actions
const WORKFLOW_STATUS_IN_FLIGHT = 'WORKFLOW_STATUS_IN_FLIGHT';
const WORKFLOW_STATUS_RCVD = 'WORKFLOW_STATUS_RCVD';

// Change how workflows are sorted
const WORKFLOW_CHANGE_SORT = 'WORKFLOW_CHANGE_SORT';

// Change whether the products of a workflow are shown or not
const WORKFLOW_COLLAPSE_EXPAND = 'WORKFLOW_COLLAPSE_EXPAND';

// Sort Fields
const SORT_NONE = 'SORT_NONE';
const SORT_NAME = 'SORT_NAME';
const SORT_LAST_COMPLETED = 'SORT_LAST_COMPLETED';
const SORT_RECENT_TEMPORAL = 'SORT_RECENT_TEMPORAL';
const SORT_RECENT_EXECUTIONS = 'SORT_RECENT_EXECUTIONS';
const SORT_NUM_RUNNING = 'SORT_NUM_RUNNING';

const initialState = Map(
  { workflows: null,
    expandedWorkflows: Set(),
    sort: Map({ field: SORT_NONE, ascending: true }),
    inFlight: false,
    error: undefined });

const isWorkflow = workflowOrProduct => !!workflowOrProduct.get('name');

/**
 * Gets the last completed execution of a workflow or a product.
 */
const getLastCompleted = (workflowOrProduct) => {
  if (isWorkflow(workflowOrProduct)) {
    return workflowOrProduct.get('products', List())
      .map(getLastCompleted)
      .sortBy(e => e.get('stop_date'))
      .reverse()
      .first();
  }
  return workflowOrProduct.get('last_execution');
};


/**
 * Returns a map containing the number of successful runs and the total number of executions that
 * completed.
 */
const getSuccessRate = (workflowOrProduct) => {
  const { successes, total } = workflowOrProduct.get('success_ratio',
    Map({ successes: 0, total: 0 }));
  return Map({ numSuccessful: successes, numExecutions: total, numFailed: (total - successes) });
};

/**
 *  Returns the number of running executions in the workflow
 */
const getNumRunning = (workflowOrProduct) => {
  if (isWorkflow(workflowOrProduct)) {
    return workflowOrProduct.get('products', List())
      .map(getNumRunning)
      .reduce((v1, v2) => v1 + v2, 0);
  }
  return workflowOrProduct.get('num_running');
};

/**
 * Returns a function for sorting products and workflows for the given field.
 */
const getSorter = (field) => {
  const now = Date.now();
  switch (field) {
    case SORT_NAME:
      return wp => (isWorkflow(wp) ? wp.get('name') : wp.get('id'));
    case SORT_LAST_COMPLETED:
      return (w) => {
        const last = getLastCompleted(w);
        if (last) {
          return now - last.get('stop_date');
        }
        return Number.MAX_VALUE;
      };
    case SORT_RECENT_TEMPORAL:
      return wp => wp.get('last_granule_id', '');
    case SORT_RECENT_EXECUTIONS:
      return (wp) => {
        const { numFailed, numExecutions } = getSuccessRate(wp);
        if (numFailed > 0) {
          return numFailed * -1;
        }
        return numExecutions;
      };
    case SORT_NUM_RUNNING:
      return wp => getNumRunning(wp);
    default:
      throw new Error(`Unexpected sort field ${field}`);
  }
};

/**
 * Reducer helper function. Takes the current state and a field to sort the workflows. Sorts the
 * workflows by the given field reversing the sort if it's already sorted by that.
 */
const sortWorkflows = (state, field) => {
  const sorter = getSorter(field);
  // Update the sort field or direction
  let newState = state.updateIn(['sort'], (s) => {
    if (s.get('field') === field) {
      // switch direction
      return s.updateIn(['ascending'], a => !a);
    }
    return s.set('field', field);
  });
  // Sort the workflows
  // First sort by name to produce a stable sort if values match
  newState = newState.updateIn(['workflows'], ws => ws.sortBy(w => w.get('name')));
  // Then sort by the designated sort
  newState = newState.updateIn(['workflows'], ws => ws.sortBy(sorter));

  // Sort products in each workflow
  newState = newState.updateIn(['workflows'], ws => ws.map((w) => {
    // First sort by name to produce a stable sort if values match
    const newW = w.updateIn(['products'], ps => ps.sortBy(p => p.get('id')));
    // Then sort by the designated sort
    return newW.updateIn(['products'], ps => ps.sortBy(sorter));
  }));

  // Sort by ascending/descending if necessary
  if (!newState.getIn(['sort', 'ascending'])) {
    return newState.updateIn(['workflows'], ws =>
      ws.reverse().map(w => w.updateIn(['products'], ps => ps.reverse()))
    );
  }
  return newState;
};

/**
 * Main reducer function for workflow status state.
 */
const reducer = (state = initialState, action) => {
  switch (action.type) {
    case WORKFLOW_STATUS_IN_FLIGHT:
      return state.set('inFlight', true);
    case WORKFLOW_STATUS_RCVD:
      return state.set('workflows', action.workflows)
        .set('inFlight', false)
        .set('error', action.error);
    case WORKFLOW_CHANGE_SORT:
      return sortWorkflows(state, action.field);
    case WORKFLOW_COLLAPSE_EXPAND:
      if (state.get('expandedWorkflows').contains(action.workflowId)) {
        return state.updateIn(['expandedWorkflows'], ws => ws.remove(action.workflowId));
      }
      return state.updateIn(['expandedWorkflows'], ws => ws.add(action.workflowId));
    default:
      return state;
  }
};

////////////////////////////////////////////////////////////////////////////////////////////////////
// Actions


/**
 * Creates an action to indicate a change in the workflow sort.
 */
const changeSort = field => ({ type: WORKFLOW_CHANGE_SORT, field: field });

/**
 * Creates an action that will reverse the collapsed/expanded state of a workflow.
 */
const collapseExpandWorkflow = workflow =>
  ({ type: WORKFLOW_COLLAPSE_EXPAND, workflowId: workflow.get('id') });

/**
 * fetchWorkflowStatus - An action creator that initiates a request to fetch the workflow status
 *
 * @param  config   Application configuration
 * @param  dispatch Function to dispatch a change to update the store.
 */
const fetchWorkflowStatus = async (config, dispatch) => {
  dispatch({ type: WORKFLOW_STATUS_IN_FLIGHT });
  try {
    const resp = await api.getWorkflowStatus(config);
    dispatch({ type: WORKFLOW_STATUS_RCVD, workflows: resp });
  }
  catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    dispatch({ type: WORKFLOW_STATUS_RCVD, error: e.message });
  }
};

/**
 * Starts reingesting granules for the given collections within the date range given.
 */
const reingestGranules = async (config, collectionIds, startDate, endDate, dispatch) => {
  try {
    await api.reingestGranules(config, collectionIds, startDate, endDate);
    // Future Improvement: add spinner to workflow so that it shows when refreshing.
    // Refresh workflow status
    fetchWorkflowStatus(config, dispatch);
  }
  catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    dispatch(
      errorAction(`An unexpected error occurred attempting to reingest the granule. ${e.message}`));
  }
};

module.exports = {
  reducer,

  SORT_NONE,
  SORT_NAME,
  SORT_LAST_COMPLETED,
  SORT_RECENT_EXECUTIONS,
  SORT_NUM_RUNNING,
  SORT_RECENT_TEMPORAL,

  // helpers
  getNumRunning,
  getSuccessRate,
  getLastCompleted,

  // Actions
  changeSort,
  collapseExpandWorkflow,
  fetchWorkflowStatus,
  reingestGranules,

  // for testing
  sortWorkflows
};