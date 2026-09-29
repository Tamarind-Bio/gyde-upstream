import { _App } from "./App";

jest.mock("d3-dsv", () => ({}));
jest.mock("react-router", () => ({}));
jest.mock("./Homepage", () => () => null);
jest.mock("./TabView", () => () => null);
jest.mock("./Landingpage", () => ({ LogoPage: () => null }));
jest.mock("./analysis/alignment", () => ({}));
jest.mock("./utils/loaders", () => ({}));
jest.mock("./session", () => ({ hydrateTabState: (data) => data }));
jest.mock("./gmsa/HeatmapUtils", () => ({}));
jest.mock("./utils/constants", () => ({ LAYOUT: [], STRUCTURE_KEYS: [] }));
jest.mock("./czekolada/lib", () => ({}));

function app() {
  const instance = new _App({});
  instance.workspaceMounted = true;
  instance.setState = (update, done) => {
    const next = typeof update === "function" ? update(instance.state) : update;
    instance.state = { ...instance.state, ...next };
    done?.();
  };
  instance.newTabState = (data) => ({ ...data, id: "new-local-tab" });
  return instance;
}

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn();
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("overlapping loads of one dataset create only one tab", async () => {
  const instance = app();
  let finish;
  fetch.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = instance.loadHistoricalSession("workspace");
  await instance.loadHistoricalSession("workspace");
  expect(fetch).toHaveBeenCalledTimes(1);
  finish({ ok: true, json: async () => ({ dataColumns: [] }) });
  await first;
  expect(instance.state.tabs).toHaveLength(1);
  expect(instance.loadingWorkspaces.has("workspace")).toBe(false);
  await instance.loadHistoricalSession("workspace");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("closing one local tab keeps a shared workspace snapshot pinned until the last tab closes", () => {
  const instance = app();
  instance.state.tabs = [
    { id: "one", _external_id: "workspace" },
    { id: "two", _external_id: "workspace" },
  ];
  instance.closeTab("one");
  jest.advanceTimersByTime(200);
  instance.closeTab("two");
  jest.advanceTimersByTime(200);
});

for (const saving of [false, true]) {
  test(`failed reopen ${saving ? "retains an active save" : "releases a closed snapshot"}`, async () => {
    const instance = app();
    if (saving) instance.savingWorkspaceId = "workspace";
    fetch.mockRejectedValue(new Error("Read failed"));
    await instance.loadHistoricalSession("workspace");
    expect(instance.loadingWorkspaces.has("workspace")).toBe(false);
    expect(instance.state.loadFailures.workspace).toBe("Read failed");
  });
}

test("a failed load from an unmounted auth session cannot release the new session snapshot", async () => {
  const instance = app();
  instance.workspaceMounted = false;
  fetch.mockRejectedValue(new Error("Read failed"));
  await instance.loadHistoricalSession("workspace");
});

test("retrying a failed load clears the old error before reopening the dataset", async () => {
  const instance = app();
  fetch.mockRejectedValueOnce(new Error("Temporary failure"));
  await instance.loadHistoricalSession("workspace");
  expect(instance.state.loadFailures.workspace).toBe("Temporary failure");
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ dataColumns: [] }),
  });
  const retry = instance.loadHistoricalSession("workspace");
  expect(instance.state.loadFailures.workspace).toBeUndefined();
  await retry;
  expect(instance.state.tabs).toHaveLength(1);
});

test('successful deletion immediately removes the row and blocks duplicate clicks', async () => {
  const instance = app();
  instance.state.sessionHistory = [{id:'one'}, {id:'two'}];
  const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
  let finish;
  fetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const deletion = instance.deleteHistoricalSession('one');
  await instance.deleteHistoricalSession('one');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(instance.state.deletingSessions).toEqual(['one']);
  finish({ok:true});
  await deletion;
  expect(instance.state.sessionHistory).toEqual([{id:'two'}]);
  expect(instance.state.deletingSessions).toEqual([]);
  expect(alert).not.toHaveBeenCalled();
});

test('committed deletion with lost response reconciles the list instead of showing Error', async () => {
  const instance = app();
  instance.state.sessionHistory = [{id:'one'}, {id:'two'}];
  fetch.mockRejectedValueOnce(new Error('Network failure'))
    .mockResolvedValueOnce({ok:true, json:async () => [{id:'two'}]});
  await instance.deleteHistoricalSession('one');
  expect(instance.state.sessionHistory).toEqual([{id:'two'}]);
  expect(instance.state.sessionActionErrors.one).toBeUndefined();
  expect(fetch.mock.calls.filter(([,options]) => options?.method === 'DELETE')).toHaveLength(1);
});

test('unconfirmed deletion retains the dataset and displays an inline error', async () => {
  const instance = app();
  instance.state.sessionHistory = [{id:'one'}];
  fetch.mockRejectedValueOnce(new Error('Workspace changed. Refresh the list.'))
    .mockResolvedValueOnce({ok:true, json:async () => [{id:'one'}]});
  await instance.deleteHistoricalSession('one');
  expect(instance.state.sessionHistory).toEqual([{id:'one'}]);
  expect(instance.state.sessionActionErrors.one).toBe('Workspace changed. Refresh the list.');
  expect(instance.state.deletingSessions).toEqual([]);
});

test('a list request started before deletion cannot restore the deleted row', async () => {
  const instance = app();
  instance.state.sessionHistory = [{id:'one'}];
  let finishList;
  fetch.mockReturnValueOnce(new Promise(resolve => {finishList=resolve;}))
    .mockResolvedValueOnce({ok:true});
  const listing = instance.loadHistory();
  await instance.deleteHistoricalSession('one');
  finishList({ok:true,json:async () => [{id:'one'}]});
  await listing;
  expect(instance.state.sessionHistory).toEqual([]);
});

test('overlapping dataset deletions preserve each other\'s failure feedback', async () => {
  const instance = app();
  instance.state.sessionHistory = [{id:'one'}, {id:'two'}, {id:'three'}];
  let finishSecond, finishThird;
  fetch.mockRejectedValueOnce(new Error('First dataset could not be deleted'))
    .mockReturnValueOnce(new Promise(resolve => {finishSecond=resolve;}))
    .mockResolvedValueOnce({ok:true,json:async () => instance.state.sessionHistory})
    .mockReturnValueOnce(new Promise(resolve => {finishThird=resolve;}));
  const first = instance.deleteHistoricalSession('one');
  const second = instance.deleteHistoricalSession('two');
  await first;
  expect(instance.state.sessionActionErrors.one).toBe('First dataset could not be deleted');
  const third = instance.deleteHistoricalSession('three');
  expect(instance.state.sessionActionErrors.one).toBe('First dataset could not be deleted');
  finishSecond({ok:true});
  finishThird({ok:true});
  await Promise.all([second, third]);
  expect(instance.state.sessionActionErrors.one).toBe('First dataset could not be deleted');
  expect(instance.state.sessionHistory).toEqual([{id:'one'}]);
});
