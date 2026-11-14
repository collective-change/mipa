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
          <q-icon name="hub" size="md" />
          <div>
            <div class="text-h6 text-weight-bold">{{ $t("templateLibraryModalTitle") }}</div>
            <div class="text-caption text-blue-1">{{ $t("templateLibraryModalSubtitle") }}</div>
          </div>
        </div>

        <div class="row items-center q-gutter-sm">
          <q-btn
            outline
            color="white"
            dense
            no-caps
            icon="file_upload"
            :label="$t('importTemplateJsonBtn')"
            @click="showImportDialog = true"
          />
          <q-btn
            outline
            color="white"
            dense
            no-caps
            icon="file_download"
            :label="$t('exportCurrentModelBtn')"
            @click="exportCurrentModel"
          />
          <q-btn icon="close" flat round dense v-close-popup />
        </div>
      </q-card-section>

      <!-- Category Filter & Search Bar -->
      <q-card-section class="bg-white q-py-sm border-bottom">
        <div class="row items-center justify-between q-col-gutter-sm">
          <div class="col-12 col-md-7 row items-center q-gutter-xs">
            <q-btn
              v-for="cat in categoryOptions"
              :key="cat.value"
              dense
              no-caps
              rounded
              size="sm"
              :unelevated="selectedCategory === cat.value"
              :flat="selectedCategory !== cat.value"
              :color="selectedCategory === cat.value ? 'primary' : 'grey-7'"
              :label="cat.label"
              @click="selectedCategory = cat.value"
            />
          </div>
          <div class="col-12 col-md-5">
            <q-input
              v-model="searchQuery"
              dense
              outlined
              clearable
              :placeholder="$t('searchTemplatesPlaceholder')"
              class="bg-white"
            >
              <template v-slot:prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
        </div>
      </q-card-section>

      <!-- Main Body: Template Cards Grid or Preview -->
      <q-card-section class="col scroll q-pa-md">
        <!-- If viewing a template detail -->
        <div v-if="previewTemplate" class="q-gutter-y-md">
          <div class="row items-center justify-between">
            <q-btn
              flat
              color="primary"
              icon="arrow_back"
              :label="$t('backToTemplatesList')"
              no-caps
              @click="previewTemplate = null"
            />
            <q-btn
              color="positive"
              unelevated
              icon="content_copy"
              :label="$t('cloneTemplateBtn')"
              :loading="isCloning"
              no-caps
              @click="confirmClone(previewTemplate)"
            />
          </div>

          <!-- Template Details Header Card -->
          <q-card flat bordered class="bg-white">
            <q-card-section>
              <div class="row items-center justify-between">
                <div>
                  <div class="text-h6 text-weight-bold text-grey-9">
                    {{ previewTemplate.title }}
                  </div>
                  <div class="text-caption text-primary text-weight-medium q-mt-xs">
                    {{ previewTemplate.sector }}
                  </div>
                </div>
                <q-badge color="blue-1" text-color="primary" class="text-weight-bold">
                  {{ previewTemplate.attribution }}
                </q-badge>
              </div>

              <div class="text-body2 text-grey-8 q-mt-sm">
                {{ previewTemplate.description }}
              </div>

              <div class="row items-center q-gutter-xs q-mt-sm">
                <q-chip
                  v-for="tag in previewTemplate.tags"
                  :key="tag"
                  dense
                  size="sm"
                  color="grey-2"
                  text-color="grey-8"
                >
                  {{ tag }}
                </q-chip>
              </div>
            </q-card-section>
          </q-card>

          <!-- Factors in Template -->
          <q-card flat bordered class="bg-white">
            <q-card-section class="q-pb-xs">
              <div class="text-subtitle1 text-weight-bold text-grey-9">
                {{ $t("templateFactorsTitle") }} ({{ previewTemplate.nodes.length }})
              </div>
            </q-card-section>
            <q-table
              flat
              bordered
              dense
              :rows="previewTemplate.nodes"
              :columns="nodeColumns"
              row-key="symbol"
              hide-pagination
              :pagination="{ rowsPerPage: 0 }"
            >
              <template v-slot:body-cell-formula="props">
                <q-td :props="props" class="font-mono text-caption text-primary">
                  {{ props.value || "-" }}
                </q-td>
              </template>
            </q-table>
          </q-card>

          <!-- Sample Actions in Template -->
          <q-card v-if="previewTemplate.sampleActions.length" flat bordered class="bg-white">
            <q-card-section class="q-pb-xs">
              <div class="text-subtitle1 text-weight-bold text-grey-9">
                {{ $t("templateSampleActionsTitle") }} ({{ previewTemplate.sampleActions.length }})
              </div>
            </q-card-section>
            <q-list separator>
              <q-item v-for="(act, idx) in previewTemplate.sampleActions" :key="idx">
                <q-item-section avatar>
                  <q-icon name="bolt" color="primary" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">{{ act.title }}</q-item-label>
                  <q-item-label caption>{{ act.notes }}</q-item-label>
                  <div class="text-caption text-grey-7 q-mt-xs">
                    Impacts: {{ (act.impacts || []).map((i) => `${i.symbol} (${i.operation}${i.operand})`).join(", ") }}
                  </div>
                </q-item-section>
                <q-item-section side>
                  <div class="text-caption text-weight-medium">
                    Spending: {{ act.estSpending }} | Effort: {{ act.estEffortHrs }}h
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card>
        </div>

        <!-- Template Cards Grid -->
        <div v-else>
          <div v-if="!filteredTemplates.length" class="text-center q-pa-xl text-grey-6">
            <q-icon name="search_off" size="3.5rem" color="grey-4" />
            <div class="text-h6 text-grey-8 q-mt-md">{{ $t("noTemplatesFound") }}</div>
          </div>

          <div v-else class="row q-col-gutter-md">
            <div
              v-for="tpl in filteredTemplates"
              :key="tpl.id"
              class="col-12 col-md-6"
            >
              <q-card flat bordered class="bg-white full-height column justify-between shadow-1 hover-shadow transition-all">
                <q-card-section>
                  <div class="row items-center justify-between q-mb-xs">
                    <q-badge color="primary" class="text-weight-medium">
                      {{ tpl.category }}
                    </q-badge>
                    <span class="text-caption text-grey-6">{{ tpl.nodes.length }} factors</span>
                  </div>

                  <div class="text-h6 text-weight-bold text-grey-9 q-mt-xs">
                    {{ tpl.title }}
                  </div>

                  <div class="text-body2 text-grey-7 q-mt-sm">
                    {{ tpl.summary }}
                  </div>

                  <div class="row items-center q-gutter-xs q-mt-md">
                    <q-chip
                      v-for="tag in tpl.tags"
                      :key="tag"
                      dense
                      size="sm"
                      color="grey-2"
                      text-color="grey-8"
                    >
                      {{ tag }}
                    </q-chip>
                  </div>
                </q-card-section>

                <q-card-actions align="between" class="bg-grey-1 q-px-md q-py-sm border-top">
                  <div class="text-caption text-grey-6">
                    {{ tpl.attribution }}
                  </div>
                  <div class="row q-gutter-xs">
                    <q-btn
                      flat
                      color="primary"
                      size="sm"
                      no-caps
                      :label="$t('previewTemplateBtn')"
                      @click="previewTemplate = tpl"
                    />
                    <q-btn
                      unelevated
                      color="positive"
                      size="sm"
                      no-caps
                      icon="add"
                      :label="$t('cloneTemplateBtn')"
                      @click="confirmClone(tpl)"
                    />
                  </div>
                </q-card-actions>
              </q-card>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Import Template Dialog -->
    <q-dialog v-model="showImportDialog">
      <q-card style="min-width: 480px; max-width: 90vw;">
        <q-card-section class="bg-primary text-white q-py-sm">
          <div class="text-h6">{{ $t("importTemplateJsonBtn") }}</div>
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-y-sm">
          <div class="text-caption text-grey-7">
            {{ $t("pasteTemplateJsonHint") }}
          </div>
          <q-input
            v-model="importJsonText"
            type="textarea"
            rows="8"
            outlined
            placeholder='{"title": "My Model", "nodes": [...]}'
            class="font-mono text-caption"
          />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat :label="$t('Cancel')" v-close-popup no-caps />
          <q-btn
            unelevated
            color="primary"
            :label="$t('importAndCloneBtn')"
            :disable="!importJsonText.trim()"
            no-caps
            @click="handleImportJson"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-dialog>
</template>

<script>
import { mapActions, mapState } from "vuex";
import {
  PUBLIC_MODEL_TEMPLATES,
  exportModelAsShareableTemplate,
  validateAndParseTemplate
} from "@/utils/modelTemplates";
import { showErrorMessage } from "@/utils/util-show-error-message";

export default {
  name: "ModelTemplateLibraryModal",
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    nodes: {
      type: Array,
      default: () => []
    },
    actions: {
      type: Array,
      default: () => []
    },
    model: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      searchQuery: "",
      selectedCategory: "all",
      previewTemplate: null,
      isCloning: false,
      showImportDialog: false,
      importJsonText: "",
      templates: PUBLIC_MODEL_TEMPLATES,
      nodeColumns: [
        { name: "name", label: "Factor Name", align: "left", field: "name" },
        { name: "symbol", label: "Short Name", align: "left", field: "symbol" },
        { name: "unit", label: "Unit", align: "left", field: "unit" },
        { name: "initialValue", label: "Initial Value", align: "right", field: "initialValue" },
        { name: "formula", label: "Formula", align: "left", field: "formula" }
      ]
    };
  },
  computed: {
    ...mapState("model", ["currentModel"]),
    isOpen: {
      get() {
        return this.modelValue;
      },
      set(val) {
        this.$emit("update:modelValue", val);
      }
    },
    categoryOptions() {
      return [
        { value: "all", label: this.$t("allCategories") },
        { value: "Disaster Response", label: this.$t("catDisasterResponse") },
        { value: "Public Health", label: this.$t("catPublicHealth") },
        { value: "Education", label: this.$t("catEducation") },
        { value: "Philanthropy", label: this.$t("catPhilanthropy") }
      ];
    },
    filteredTemplates() {
      let list = this.templates;
      if (this.selectedCategory !== "all") {
        list = list.filter((t) => t.category === this.selectedCategory);
      }
      if (this.searchQuery && this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase().trim();
        list = list.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.summary.toLowerCase().includes(q) ||
            t.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return list;
    }
  },
  methods: {
    ...mapActions("model", ["addNode"]),

    async confirmClone(template) {
      const modelId = this.model?.id || this.currentModel?.id || this.$route?.params?.modelId;
      if (!modelId) {
        showErrorMessage("No active model found to clone into.");
        return;
      }

      this.isCloning = true;
      try {
        let addedCount = 0;
        for (const node of template.nodes) {
          // Check if factor already exists
          const exists = (this.nodes || []).some(
            (n) => n.symbol === node.symbol || n.name.toLowerCase() === node.name.toLowerCase()
          );
          if (!exists) {
            await this.addNode({
              modelId,
              node: {
                name: node.name,
                symbol: node.symbol,
                unit: node.unit || "",
                latestValue: node.initialValue ?? 0,
                symbolFormula: node.formula || "",
                sysFormula: node.formula || "",
                costCategory: node.costCategory || "operational",
                notes: node.notes || "",
                isHourlyCost: false,
                isEstimate: Boolean(node.isEstimate)
              }
            });
            addedCount++;
          }
        }

        this.$q?.notify?.({
          type: "positive",
          message: `${this.$t("templateClonedSuccess")} (${addedCount} factors added)`,
          position: "top"
        });
        this.isOpen = false;
      } catch (err) {
        console.error("Error cloning template nodes:", err);
        showErrorMessage("Failed to clone template nodes: " + (err.message || "Unknown error"));
      } finally {
        this.isCloning = false;
      }
    },

    exportCurrentModel() {
      try {
        const exported = exportModelAsShareableTemplate(
          this.model || this.currentModel,
          this.nodes,
          this.actions,
          { author: "Collective Change Community" }
        );
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exported, null, 2));
        const downloadAnchor = document.createElement("a");
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `mipa_model_${exported.id}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        this.$q?.notify?.({
          type: "positive",
          message: this.$t("templateExportedSuccess"),
          position: "top"
        });
      } catch (err) {
        console.error("Export error:", err);
        showErrorMessage("Failed to export model template: " + (err.message || "Unknown error"));
      }
    },

    async handleImportJson() {
      try {
        const parsed = validateAndParseTemplate(this.importJsonText);
        this.showImportDialog = false;
        this.importJsonText = "";
        await this.confirmClone(parsed);
      } catch (err) {
        showErrorMessage(err.message || "Failed to parse template JSON.");
      }
    }
  }
};
</script>

<style scoped>
.font-mono {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.hover-shadow:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.transition-all {
  transition: all 0.2s ease-in-out;
}
.border-bottom {
  border-bottom: 1px solid #e0e0e0;
}
.border-top {
  border-top: 1px solid #e0e0e0;
}
</style>
