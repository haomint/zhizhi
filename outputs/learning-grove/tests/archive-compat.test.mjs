import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { LearningService } from "../src/application/service.ts";
import { IndexedDBRepository } from "../src/platform/repository.ts";
import { validateArchive } from "../src/core/domain.ts";

const fixtures = [
  { name: "personal-1.json", current: false },
  { name: "personal-2-missing-versions.json", current: false },
  { name: "personal-2-current.json", current: true },
];

function load(name) {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/archives/${name}`, import.meta.url),
      "utf8",
    ),
  );
}

function environment(repository = new IndexedDBRepository(new IDBFactory())) {
  return {
    repository,
    service: new LearningService(repository, {
      native: false,
      status: async () => ({ configured: false }),
      complete: async () => assert.fail("档案兼容测试不得调用模型"),
    }),
  };
}

function assertPreserved(actual, original) {
  assert.equal(actual.trees.length, original.trees.length);
  for (const [i, tree] of original.trees.entries()) {
    const next = actual.trees[i];
    for (const field of ["id", "title", "goal", "current_node_id"])
      assert.equal(next[field], tree[field], field);
    assert.deepEqual(next.preferences, tree.preferences);
    assert.deepEqual(next.materials, tree.materials);
    assert.equal(next.nodes.length, tree.nodes.length);
    for (const [j, node] of tree.nodes.entries()) {
      const migrated = next.nodes[j];
      for (const field of ["id", "title", "status", "ready", "page"])
        assert.equal(migrated[field], node[field], field);
      assert.deepEqual(migrated.cards, node.cards);
    }
  }
  assert.deepEqual(actual.memories, original.memories);
  assert.deepEqual(actual.events, original.events);
  assert.deepEqual(actual.strategies, original.strategies ?? []);
  assert.deepEqual(actual.settlements, original.settlements ?? []);
}

// Import is a write: only these two internal counters intentionally advance.
function withoutWriteCounters(state) {
  const { revision, semantic_revision, ...content } = state;
  assert.ok(Number.isInteger(revision));
  assert.ok(Number.isInteger(semantic_revision));
  return content;
}

for (const fixture of fixtures) {
  test(`${fixture.name}: migrates fixed archives and preserves non-default versions`, () => {
    const archive = load(fixture.name);
    const before = structuredClone(archive);
    const migrated = validateArchive(archive);
    assert.deepEqual(archive, before, "校验不能修改原始档案");
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.memory_version, fixture.current ? 4 : 0);
    assert.equal(migrated.event_seq, 3);
    const tree = migrated.trees[0];
    assert.equal(tree.contract_version, fixture.current ? 3 : 1);
    assert.equal(tree.material_version, fixture.current ? 2 : 0);
    assert.equal(tree.strategy_version, fixture.current ? 5 : 0);
    assert.deepEqual(
      tree.nodes.map((node) => node.content_version),
      fixture.current ? [2, 4] : [1, 1],
    );
    assertPreserved(migrated, archive.state);
  });

  test(`${fixture.name}: service import, persisted reopen, export and reimport retain learning`, async () => {
    const archive = load(fixture.name);
    const first = environment();
    await first.service.dispatch({
      type: "import_archive",
      archive,
      mode: "replace",
    });
    const exported = JSON.parse(JSON.stringify(await first.service.export()));
    assert.equal(exported.format, "zhizhi-personal-2");
    assert.ok(Number.isFinite(Date.parse(exported.exported_at)));
    assertPreserved(exported.state, archive.state);
    assert.deepEqual(Object.keys(exported).sort(), [
      "exported_at",
      "format",
      "state",
    ]);

    const reopened = environment(first.repository);
    assert.deepEqual((await reopened.service.export()).state, exported.state);

    const second = environment();
    await second.service.dispatch({
      type: "import_archive",
      archive: exported,
      mode: "replace",
    });
    const again = JSON.parse(JSON.stringify(await second.service.export()));
    assert.deepEqual(
      withoutWriteCounters(again.state),
      withoutWriteCounters(exported.state),
    );
  });
}
