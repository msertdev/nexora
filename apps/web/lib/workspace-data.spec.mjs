import assert from "node:assert/strict";
import test from "node:test";
import {
  groupTasksByStatus,
  issueStatuses,
  taskStatusOrder,
  toIssueStatus,
  toTaskStatus,
} from "./workspace-data.ts";

test("maps each API status to its matching UI status and back", () => {
  const mappedStatuses = issueStatuses.map((status) => toTaskStatus(status));

  assert.deepEqual(mappedStatuses, taskStatusOrder);
  assert.deepEqual(mappedStatuses.map((status) => toIssueStatus(status)), issueStatuses);
  assert.equal(toTaskStatus("IN_PROGRESS"), "in-progress");
});

test("keeps all five statuses in separate issue groups", () => {
  const tasks = taskStatusOrder.map((status) => ({ id: status, status }));
  const groups = groupTasksByStatus(tasks);

  assert.deepEqual(groups.map((group) => group.status), taskStatusOrder);
  for (const status of taskStatusOrder) {
    const group = groups.find((item) => item.status === status);
    assert.ok(group);
    assert.deepEqual(group.tasks.map((task) => task.id), [status]);
  }
  assert.equal(
    groups.find((group) => group.status === "in-progress")?.tasks[0]?.id,
    "in-progress",
  );
});
