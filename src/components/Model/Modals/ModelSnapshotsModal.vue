<template>
  <q-dialog
    v-model="isOpen"
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card class="column full-height bg-grey-1">
      <!-- Modal Header -->
      <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm shadow-2">
        <div class="row items-center q-gutter-sm">
          <q-icon name="history_edu" size="md" />
          <div>
            <div class="text-h6 text-weight-bold">{{ $t("modelSnapshotsModalTitle") }}</div>
            <div class="text-caption text-blue-1">{{ $t("modelSnapshotsModalSubtitle") }}</div>
          </div>
        </div>

        <div class="row items-center q-gutter-sm">
          <q-btn
            color="white"
            text-color="primary"
            unelevated
            no-caps
            icon="camera_alt"
            :label="$t('takeSnapshotBtn')"
            @click="showCreateDialog = true"
          />
          <q-btn icon="close" flat round dense v-close-popup />
        </div>
      </q-card-section>

      <!-- Tabs Navigation -->
      <q-card-section class="bg-white q-pa-none border-bottom">
        <q-tabs
          v-model="activeTab"
          dense
          class="text-grey-7"
          active-color="primary"
          indicator-color="primary"
          align="left"
        >
          <q-tab name="timeline" icon="history" :label="$t('snapshotsTimelineTab')" no-caps />
          <q-tab name="diff" icon="compare_arrows" :label="$t('baselineDiffTab')" no-caps />
        </q-tabs>
      </q-card-section>

      <!-- Main Body -->
      <q-card-section class="col scroll q-pa-md">
        <!-- TAB 1: Snapshots Timeline -->
        <div v-if="activeTab === 'timeline'" class="timeline-container">
          <!-- Empty State -->
          <div v-if="!snapshots.length" class="text-center q-pa-xl">
            <q-icon name="history_toggle_off" size="4rem" color="grey-5" />
            <div class="text-h6 text-grey-8 q-mt-md">{{ $t("noSnapshotsYet") }}</div>
            <div class="text-body2 text-grey-6 q-mt-xs">{{ $t("noSnapshotsSubtext") }}</div>
            <q-btn
              color="primary"
              unelevated
              no-caps
              icon="camera_alt"
              :label="$t('takeSnapshotBtn')"
              class="q-mt-lg"
              @click="showCreateDialog = true"
            />
          </div>

          <!-- Snapshots List -->
          <div v-else class="q-gutter-y-md">
            <q-card
              v-for="snap in snapshots"
              :key="snap.id"
              bordered
              flat
              class="bg-white shadow-1 rounded-borders"
            >
              <q-card-section>
                <div class="row items-center justify-between">
                  <div class="row items-center q-gutter-sm">
                    <q-badge color="primary" class="q-px-sm q-py-xs text-weight-bold">
                      {{ snap.nodeCount }} {{ $t("factorCountLabel") }}
                    </q-badge>
                    <div class="text-subtitle1 text-weight-bold text-grey-9">
                      {{ snap.note }}
                    </div>
                  </div>

                  <!-- Hash & Integrity Verification Badge -->
                  <div class="row items-center q-gutter-xs">
                    <q-chip
                      clickable
                      dense
                      size="sm"
                      :color="getVerificationColor(snap.id)"
                      :text-color="getVerificationTextColor(snap.id)"
                      icon="lock"
                      @click="verifySnapshot(snap)"
                    >
                      SHA-256: {{ (snap.contentHash || "").slice(0, 8) }}...
                      <q-tooltip>{{ $t("verifyIntegrityBtn") }}</q-tooltip>
                    </q-chip>
                  </div>
                </div>

                <div class="text-caption text-grey-6 q-mt-xs row items-center q-gutter-md">
                  <span>
                    <q-icon name="schedule" size="xs" class="q-mr-xs" />
                    {{ formatTimestamp(snap.createdAt) }}
                  </span>
                  <span>
                    <q-icon name="person" size="xs" class="q-mr-xs" />
                    {{ snap.author?.displayName || snap.author?.email || "Decision Staff" }}
                  </span>
                </div>
              </q-card-section>

              <q-separator />

              <q-card-actions align="right" class="q-px-md q-py-sm bg-grey-1">
                <q-btn
                  flat
                  dense
                  no-caps
                  color="grey-8"
                  icon="download"
                  :label="$t('exportSnapshotJsonBtn')"
                  @click="exportJson(snap)"
                />
                <q-btn
                  unelevated
                  dense
                  no-caps
                  color="primary"
                  icon="compare_arrows"
                  :label="$t('compareWithCurrentBtn')"
                  @click="selectForDiff(snap)"
                />
              </q-card-actions>
            </q-card>
          </div>
        </div>

        <!-- TAB 2: Baseline Diff Viewer -->
        <div v-else class="diff-container">
          <div class="row items-center q-gutter-md q-mb-md">
            <q-select
              outlined
              dense
              v-model="selectedSnapshotId"
              :options="snapshotOptions"
              emit-value
              map-options
              :label="$t('snapshotSelectPlaceholder')"
              class="col-12 col-md-6 bg-white"
            />
          </div>

          <div v-if="!selectedSnapshot" class="text-center q-pa-xl text-grey-6">
            {{ $t("snapshotSelectPlaceholder") }}
          </div>

          <div v-else>
            <!-- Diff Summary Banner -->
            <q-card flat bordered class="q-mb-md bg-white">
              <q-card-section>
                <div class="row items-center justify-between q-mb-sm">
                  <div class="text-subtitle1 text-weight-bold text-primary">
                    {{ selectedSnapshot.note }}
                  </div>
                  <div class="row items-center q-gutter-xs">
                    <q-badge color="orange" text-color="white">
                      {{ diffResult.modified.length }} {{ $t("diffModifiedCount") }}
                    </q-badge>
                    <q-badge color="positive" text-color="white">
                      {{ diffResult.added.length }} {{ $t("diffAddedCount") }}
                    </q-badge>
                    <q-badge color="negative" text-color="white">
                      {{ diffResult.removed.length }} {{ $t("diffRemovedCount") }}
                    </q-badge>
                    <q-badge color="grey-6" text-color="white">
                      {{ diffResult.unchangedCount }} {{ $t("diffUnchangedCount") }}
                    </q-badge>
                  </div>
                </div>

                <div class="text-body2 text-grey-8" style="white-space: pre-line; line-height: 1.6">
                  {{ diffResult.summaryNarrative }}
                </div>
              </q-card-section>
            </q-card>

            <!-- Changes Table -->
            <q-table
              flat
              bordered
              dense
              :rows="diffTableRows"
              :columns="diffColumns"
              row-key="key"
              hide-pagination
              :pagination="{ rowsPerPage: 0 }"
              class="bg-white"
            >
              <template v-slot:body-cell-type="props">
                <q-td :props="props">
                  <q-chip
                    dense
                    size="sm"
                    :color="props.value === 'added' ? 'green-1' : (props.value === 'removed' ? 'red-1' : 'amber-2')"
                    :text-color="props.value === 'added' ? 'positive' : (props.value === 'removed' ? 'negative' : 'amber-10')"
                  >
                    {{ formatDiffType(props.value) }}
                  </q-chip>
                </q-td>
              </template>

              <template v-slot:body-cell-oldValue="props">
                <q-td :props="props" class="text-grey-8 font-mono">
                  <span v-if="props.value !== null && props.value !== undefined" class="bg-red-1 q-px-xs rounded-borders text-negative">
                    {{ props.value }}
                  </span>
                  <span v-else class="text-grey-4">-</span>
                </q-td>
              </template>

              <template v-slot:body-cell-newValue="props">
                <q-td :props="props" class="text-grey-10 font-mono">
                  <span v-if="props.value !== null && props.value !== undefined" class="bg-green-1 q-px-xs rounded-borders text-positive text-weight-bold">
                    {{ props.value }}
                  </span>
                  <span v-else class="text-grey-4">-</span>
                </q-td>
              </template>

              <template v-slot:body-cell-shiftPercent="props">
                <q-td :props="props">
                  <span v-if="props.value !== null" :class="props.value < 0 ? 'text-negative text-weight-bold' : 'text-positive text-weight-bold'">
                    {{ props.value > 0 ? '+' : '' }}{{ props.value }}%
                  </span>
                  <span v-else class="text-grey-4">-</span>
                </q-td>
              </template>
            </q-table>
          </div>
        </div>
      </q-card-section>

      <!-- Snapshot Creation Dialog -->
      <q-dialog v-model="showCreateDialog">
        <q-card style="min-width: 420px" class="q-pa-sm">
          <q-card-section>
            <div class="text-h6 text-weight-bold text-primary">{{ $t("takeSnapshotBtn") }}</div>
            <div class="text-caption text-grey-6">{{ $t("modelSnapshotsModalSubtitle") }}</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-input
              outlined
              dense
              v-model="newSnapshotNote"
              :label="$t('snapshotNoteLabel')"
              :hint="$t('snapshotNoteHint')"
              autofocus
              @keyup.enter="handleCreateSnapshot"
            />
          </q-card-section>

          <q-card-actions align="right" class="q-px-md q-pb-md">
            <q-btn flat no-caps :label="$t('Cancel') || 'Cancel'" v-close-popup />
            <q-btn
              unelevated
              no-caps
              color="primary"
              :label="$t('takeSnapshotBtn')"
              :disable="!newSnapshotNote.trim()"
              @click="handleCreateSnapshot"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </q-card>
  </q-dialog>
</template>

<script>
import { exportFile, Notify } from "quasar";
import { firebaseAuth } from "@/boot/firebase";
import {
  createModelSnapshot,
  verifySnapshotIntegrity,
  diffModelSnapshots,
  saveSnapshotToStorage,
  loadSnapshotsFromStorage
} from "@/utils/modelSnapshots";

export default {
  name: "ModelSnapshotsModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    model: {
      type: Object,
      default: () => ({})
    },
    nodes: {
      type: Array,
      default: () => []
    }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      activeTab: "timeline",
      snapshots: [],
      selectedSnapshotId: null,
      showCreateDialog: false,
      newSnapshotNote: "",
      verifications: {}
    };
  },
  computed: {
    isOpen: {
      get() {
        return this.modelValue;
      },
      set(val) {
        this.$emit("update:modelValue", val);
      }
    },
    snapshotOptions() {
      return this.snapshots.map((s) => ({
        label: `${s.note} (${new Date(s.createdAt).toLocaleDateString()} · ${s.nodeCount} ${this.$t("factorCountLabel")})`,
        value: s.id
      }));
    },
    selectedSnapshot() {
      return this.snapshots.find((s) => s.id === this.selectedSnapshotId) || null;
    },
    diffResult() {
      if (!this.selectedSnapshot) {
        return { modified: [], added: [], removed: [], unchangedCount: 0, summaryNarrative: "" };
      }
      return diffModelSnapshots(this.selectedSnapshot, this.nodes, { locale: this.$i18n.locale });
    },
    diffColumns() {
      return [
        { name: "type", label: this.$t("statusCol"), field: "type", align: "center" },
        { name: "name", label: this.$t("factorName"), field: "name", align: "left" },
        { name: "field", label: this.$t("fieldCol"), field: "field", align: "left" },
        { name: "oldValue", label: this.$t("oldValueCol"), field: "oldValue", align: "left" },
        { name: "newValue", label: this.$t("newValueCol"), field: "newValue", align: "left" },
        { name: "shiftPercent", label: this.$t("shiftPercentCol"), field: "shiftPercent", align: "right" }
      ];
    },
    diffTableRows() {
      const rows = [];
      const diff = this.diffResult;

      diff.modified.forEach((m) => {
        m.changes.forEach((c) => {
          rows.push({
            key: `${m.id}_${c.field}`,
            type: "modified",
            name: `${m.name} (${m.symbol || m.id})`,
            field: c.label || c.field,
            oldValue: c.oldValue,
            newValue: c.newValue,
            shiftPercent: c.shiftPercent ?? null
          });
        });
      });

      diff.added.forEach((a) => {
        rows.push({
          key: `added_${a.id}`,
          type: "added",
          name: `${a.name} (${a.symbol || a.id})`,
          field: "-",
          oldValue: null,
          newValue: a.formula || a.initialValue || "-",
          shiftPercent: null
        });
      });

      diff.removed.forEach((r) => {
        rows.push({
          key: `removed_${r.id}`,
          type: "removed",
          name: `${r.name} (${r.symbol || r.id})`,
          field: "-",
          oldValue: r.formula || r.initialValue || "-",
          newValue: null,
          shiftPercent: null
        });
      });

      return rows;
    }
  },
  watch: {
    isOpen(val) {
      if (val) {
        this.reloadSnapshots();
      }
    }
  },
  created() {
    this.reloadSnapshots();
  },
  methods: {
    reloadSnapshots() {
      if (!this.model?.id) return;
      this.snapshots = loadSnapshotsFromStorage(this.model.id);
      if (this.snapshots.length > 0 && !this.selectedSnapshotId) {
        this.selectedSnapshotId = this.snapshots[0].id;
      }
    },
    formatTimestamp(iso) {
      if (!iso) return "-";
      return new Date(iso).toLocaleString();
    },
    formatDiffType(type) {
      if (type === "added") return this.$t("diffAddedCount");
      if (type === "removed") return this.$t("diffRemovedCount");
      return this.$t("diffModifiedCount");
    },
    getVerificationColor(id) {
      const res = this.verifications[id];
      if (!res) return "blue-1";
      return res.valid ? "green-1" : "red-1";
    },
    getVerificationTextColor(id) {
      const res = this.verifications[id];
      if (!res) return "primary";
      return res.valid ? "positive" : "negative";
    },
    verifySnapshot(snap) {
      const res = verifySnapshotIntegrity(snap);
      this.verifications[snap.id] = res;
      Notify.create({
        type: res.valid ? "positive" : "negative",
        message: res.valid ? this.$t("hashVerifiedBadge") : this.$t("hashTamperedAlert"),
        caption: `SHA-256: ${res.storedHash}`,
        position: "top"
      });
    },
    handleCreateSnapshot() {
      if (!this.newSnapshotNote.trim()) return;

      const user = firebaseAuth.currentUser;
      const author = {
        uid: user?.uid || "staff",
        displayName: user?.displayName || user?.email || "Decision Staff",
        email: user?.email || ""
      };

      const snap = createModelSnapshot(this.model, this.nodes, {
        note: this.newSnapshotNote.trim(),
        author
      });

      saveSnapshotToStorage(this.model.id, snap);
      this.reloadSnapshots();
      this.selectedSnapshotId = snap.id;

      this.newSnapshotNote = "";
      this.showCreateDialog = false;

      Notify.create({
        type: "positive",
        message: this.$t("snapshotCreatedSuccess"),
        caption: `SHA-256: ${snap.contentHash.slice(0, 16)}...`,
        position: "top"
      });
    },
    selectForDiff(snap) {
      this.selectedSnapshotId = snap.id;
      this.activeTab = "diff";
    },
    exportJson(snap) {
      const filename = `Model_Snapshot_${(this.model.name || "Model").replace(/\s+/g, "_")}_${snap.id}.json`;
      const content = JSON.stringify(snap, null, 2);
      exportFile(filename, content, "application/json");
    }
  }
};
</script>

<style scoped>
.font-mono {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.85rem;
}
</style>
