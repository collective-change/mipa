<template>
  <div v-if="uiAction && uiAction.actionMchState">
    <q-form @submit.prevent="submitForm">
      <div class="row items-center">
        <div
          v-bind:class="{ 'col-12 col-md-4': !embedded, 'col-12': embedded }"
        >
          <q-input
            class="text-h6"
            v-model="title"
            :rules="[(val) => !!val || 'Field is required']"
            ref="actionTitle"
          >
            <template v-slot:prepend>
              <q-chip square color="primary" text-color="white">
                {{ $t(uiAction.actionMchState.value) }}
              </q-chip>
            </template>
            <template v-slot:after v-if="embedded">
              <q-btn
                dense
                :label="$t('Details')"
                color="primary"
                @click="
                  $router.push(
                    `/org/${currentOrg.nameSlug}/action-details/${currentOrg.id}/${uiAction.id}`
                  )
                "
              />
            </template>
          </q-input>
        </div>

        <div
          v-bind:class="{ 'col-12 col-md-2': !embedded, 'col-12': embedded }"
        >
          <div class="q-px-xs q-gutter-xs row items-center">
            <q-chip outline color="primary"
              >{{ $t("Leverage") }} {{ formatNumber(uiAction.actionLeverage, 2) }}</q-chip
            >
            <q-chip v-if="actionSroiMetrics.sroiRatio !== null" outline color="positive" class="text-weight-bold"
              >SROI {{ formatSroiRatio(actionSroiMetrics.sroiRatio) }}</q-chip
            >
            <q-chip outline color="primary"
              >{{ $t("totalRoi") }} {{ formatNumber(uiAction.totalRoi, 2) }}</q-chip
            >
            <q-btn
              flat
              dense
              round
              size="sm"
              icon="psychology"
              color="primary"
              :title="$t('explainRanking')"
              @click="showExplainRanking = true"
            >
              <q-tooltip>{{ $t("explainRankingShort") }}</q-tooltip>
            </q-btn>
          </div>
        </div>

        <div
          v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
        >
          <div class="row q-pa-sm q-gutter-sm">
            <calculator-ui
              calculationType="uiAction"
              :buttonLabel="$t('Recalculate')"
              unelevated
              no-caps
              :uiAction="{ ...uiAction, saveFullResults, saveResultsOnDevice }"
            />

            <q-checkbox
              v-model="saveResultsOnDevice"
              :label="$t('Save results for charts on this device')"
              @update:model-value="
                setSaveResultsOnDeviceForAction(action.id, saveResultsOnDevice)
              "
            />
            <q-checkbox
              v-model="saveFullResults"
              :label="$t('Save full results for download (next calculation only)')"
            />

            <export-calc-results
              data-source="resultsOfAction"
              :actionId="uiAction.id"
              :actionTitle="uiAction.title"
              :buttonLabel="$t('Download results')"
              flat
              no-caps
            />
            <q-btn
              flat
              no-caps
              icon="description"
              color="primary"
              :label="$t('decisionBrief')"
              @click="showDecisionBrief = true"
            />
            <q-btn-group v-if="uiAction.actionMchState.value == 'initiating'">
              <q-btn
                :label="$t('Cancel')"
                @click="actionService.send('CANCEL')"
                color="primary"
              />
              <q-btn
                :label="$t('Request approval')"
                @click="actionService.send('REQUEST_APPROVAL')"
                color="primary"
              />
              <q-btn
                :label="$t('Approval not needed')"
                @click="actionService.send('APPROVAL_NOT_NEEDED')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'to_approve'">
              <q-btn
                :label="$t('Approve')"
                @click="actionService.send('APPROVE')"
                color="primary"
              />
              <q-btn
                :label="$t('Reject')"
                @click="actionService.send('REJECT')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'rejected'">
              <q-btn
                :label="$t('Request approval')"
                @click="actionService.send('REQUEST_APPROVAL')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'eligible'">
              <q-btn
                :label="$t('Approval needed')"
                @click="actionService.send('APPROVAL_NEEDED')"
                color="primary"
              />
              <q-btn
                :label="$t('Cancel')"
                @click="actionService.send('CANCEL')"
                color="primary"
              />
              <q-btn
                :label="$t('Mark as done')"
                @click="actionService.send('FINISH')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'approved'">
              <q-btn
                :label="$t('Re-approval needed')"
                @click="actionService.send('APPROVAL_NEEDED')"
                color="primary"
              />
              <q-btn
                :label="$t('Request to cancel')"
                @click="actionService.send('REQUEST_CANCELLATION')"
                color="primary"
              />
              <q-btn
                :label="$t('Mark as done')"
                @click="actionService.send('FINISH')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'done'">
              <q-btn
                :label="$t('Revert to eligible')"
                @click="actionService.send('REVERT_FINISH')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group
              v-if="uiAction.actionMchState.value == 'cancellation_requested'"
            >
              <q-btn
                :label="$t('Reject cancellation')"
                @click="actionService.send('REJECT_CANCELLATION')"
                color="primary"
              />
              <q-btn
                :label="$t('Approve cancellation')"
                @click="actionService.send('APPROVE_CANCELLATION')"
                color="primary"
              />
            </q-btn-group>

            <q-btn-group v-if="uiAction.actionMchState.value == 'canceled'">
              <q-btn
                :label="$t('Revive')"
                @click="actionService.send('REVIVE')"
                color="primary"
              />
            </q-btn-group>

            <!-- <q-btn color="primary" label="Meet about this" /> -->
          </div>
        </div>
      </div>

      <div class="row q-col-gutter-md">
        <div
          v-bind:class="{ 'col-12 col-md-6': !embedded, 'col-12': embedded }"
        >
          <q-input v-model="notes" :label="$t('Notes')" filled autogrow />
          <q-card-actions align="right">
            <q-btn :label="$t('Save')" color="primary" type="submit" unelevated no-caps />
          </q-card-actions>

          <div class="text-h6 q-mt-md">{{ $t("Impact estimates") }}</div>
          <!--
          <div class="q-gutter-sm">
            <q-checkbox
              v-model="useSimpleEstimateMethod"
              :label="$t('Use a simple estimate')"
            />
          </div>

          <div
            v-if="useSimpleEstimateMethod"
            class="row q-gutter-md items-start"
          >
            <q-input
              v-model.number="simpleEstimateTotalBenefit"
              :label="$t('simpleEstimateTotalBenefit')"
              type="number"
              step="any"
              :suffix="currentOrg.currency"
              :rules="[
                (val) => val == null || val >= 0 || 'Should be at least 0',
              ]"
              filled
              class="col-3"
              style="max-width: 150px"
              debounce="500"
            />
            <q-input
              class="col-8"
              v-model="simpleEstimateTotalBenefitNotes"
              :label="$t('simpleEstimateTotalBenefitNotes')"
              filled
              autogrow
            />
            simpleEstimateTotalBenefit simpleEstimateTotalBenefitNotes
            simpleEstimateOtherCosts simpleEstimatseOtherCostsNotes
          </div>
          <impacts v-else /> -->
          <impacts />

          <q-dialog v-model="showAddRoleCost">
            <q-card style="width: 420px; max-width: 90vw">
              <q-card-section>
                <div class="text-h6">{{ $t("Add a role or person's hourly cost") }}</div>
                <div class="text-body2 text-grey-8 q-mt-xs">{{ $t("roleCostHint") }}</div>
              </q-card-section>
              <q-card-section class="q-gutter-md">
                <q-input
                  v-model="newRoleCost.name"
                  :label="$t('roleCostName')"
                  :placeholder="$t('roleCostNameExample')"
                  autofocus
                  filled
                />
                <q-input
                  v-model.number="newRoleCost.cost"
                  :label="$t('roleCostPerHour')"
                  type="number"
                  step="any"
                  :suffix="averageEffortCostPerHourNode ? averageEffortCostPerHourNode.unit : ''"
                  filled
                />
              </q-card-section>
              <q-card-actions align="right">
                <q-btn flat no-caps :label="$t('Cancel')" v-close-popup />
                <q-btn
                  unelevated
                  no-caps
                  color="primary"
                  :label="$t('Add')"
                  :loading="addingRoleCost"
                  :disable="!newRoleCost.name || !(newRoleCost.cost >= 0)"
                  @click="addRoleCost"
                />
              </q-card-actions>
            </q-card>
          </q-dialog>

          <!-- Consolidated Progress & Actuals Card -->
          <q-card flat bordered class="q-mt-md bg-grey-1 rounded-borders">
            <q-card-section class="q-pb-xs">
              <div class="row items-center justify-between">
                <div>
                  <div class="text-subtitle1 text-weight-bold text-primary row items-center">
                    <q-icon name="insights" class="q-mr-xs" size="20px" />
                    {{ $t("progressAndActualsTitle") }}
                  </div>
                  <div class="text-caption text-grey-7">
                    {{ $t("progressAndActualsSubtitle") }}
                  </div>
                </div>
                <div class="row items-center q-gutter-xs">
                  <q-chip
                    dense
                    :color="progressChipColor"
                    text-color="white"
                    class="text-weight-bold"
                  >
                    {{ effortCompletionPercentage || 0 }}% {{ $t("percentDone") }}
                  </q-chip>
                  <q-chip
                    dense
                    outline
                    :color="budgetVarianceColor"
                    class="text-weight-medium"
                  >
                    {{ budgetVarianceText }}
                  </q-chip>
                </div>
              </div>
            </q-card-section>

            <!-- Visual Progress Indicators (Dual Progress Bars) -->
            <q-card-section class="q-pt-xs q-pb-sm">
              <div class="q-gutter-y-sm">
                <!-- Hours Progress -->
                <div>
                  <div class="row justify-between text-caption text-grey-8 q-mb-xs">
                    <span>
                      <q-icon name="schedule" size="14px" class="q-mr-xs" />
                      {{ $t("hoursProgressLabel") }}
                    </span>
                    <span class="text-weight-medium">
                      {{ formatNumber(completedWorkHours, 1) }} / {{ formatNumber(estEffortHrs || 0, 1) }} hours
                      ({{ effortCompletionPercentage || 0 }}%)
                    </span>
                  </div>
                  <q-linear-progress
                    :value="hoursProgressRatio"
                    color="primary"
                    track-color="grey-3"
                    size="8px"
                    rounded
                  />
                </div>

                <!-- Budget Spending Progress -->
                <div>
                  <div class="row justify-between text-caption text-grey-8 q-mb-xs">
                    <span>
                      <q-icon name="payments" size="14px" class="q-mr-xs" />
                      {{ $t("spendingProgressLabel") }}
                    </span>
                    <span class="text-weight-medium" :class="isOverBudget ? 'text-negative' : 'text-grey-9'">
                      {{ formatNumber(spentAmount || 0, 2) }} / {{ formatNumber(estSpending || 0, 2) }} {{ currentOrg.currency }}
                      ({{ Math.round(spendingProgressRatio * 100) }}%)
                    </span>
                  </div>
                  <q-linear-progress
                    :value="Math.min(spendingProgressRatio, 1)"
                    :color="isOverBudget ? 'negative' : 'secondary'"
                    track-color="grey-3"
                    size="8px"
                    rounded
                  />
                </div>
              </div>
            </q-card-section>

            <q-separator />

            <!-- Input Controls & Milestones Grid -->
            <q-card-section class="q-pt-sm">
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                {{ $t("effortCostPerHour") }}
              </div>
              <div class="row q-col-gutter-sm items-start q-mb-sm">
                <div class="col-12 col-sm-7">
                  <q-select
                    ref="effortCostSelect"
                    v-model="effortCostChoice"
                    :label="$t('effortCostPerHour')"
                    :options="effortCostOptions"
                    emit-value
                    map-options
                    filled
                    dense
                  >
                    <template v-slot:after-options>
                      <q-item clickable @click="openAddRoleCost">
                        <q-item-section avatar>
                          <q-icon name="add" color="primary" />
                        </q-item-section>
                        <q-item-section class="text-primary">
                          {{ $t("Add a role or person's hourly cost") }}
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                </div>
                <div class="col-12 col-sm-5" v-if="effortCostPerHrType == 'use_custom'">
                  <q-input
                    v-model.number="customEffortCostPerHr"
                    :label="$t('customEffortCostPerHr')"
                    type="number"
                    dense
                    :suffix="averageEffortCostPerHourNode ? averageEffortCostPerHourNode.unit : ''"
                    :rules="[(val) => val == null || val >= 0 || 'Should be at least 0']"
                    filled
                    debounce="500"
                  />
                </div>
              </div>

              <!-- Work Hours & Preset Buttons -->
              <div class="row q-col-gutter-sm items-start q-mb-sm">
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model.number="estEffortHrs"
                    :label="$t('estEffortHrs')"
                    type="number"
                    step="any"
                    dense
                    suffix="hours"
                    :rules="[(val) => val == null || val >= 0 || 'Should be at least 0']"
                    filled
                    debounce="500"
                  />
                </div>
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model.number="effortCompletionPercentage"
                    type="number"
                    step="any"
                    dense
                    :label="$t('percentDone')"
                    suffix="%"
                    :rules="[(val) => val == null || val >= 0 || 'Should be at least 0']"
                    filled
                    debounce="500"
                  />
                </div>
              </div>

              <!-- Completion Slider & Presets -->
              <div class="q-px-xs q-mb-md">
                <q-slider
                  :model-value="effortCompletionPercentage || 0"
                  @change="(val) => { effortCompletionPercentage = val; }"
                  :min="0"
                  :max="100"
                  label
                  color="primary"
                />
                <div class="row items-center justify-between text-caption text-grey-7 q-mt-xs">
                  <span>{{ $t("setCompletionPreset") }}:</span>
                  <div class="row q-gutter-xs">
                    <q-btn
                      v-for="p in [0, 25, 50, 75, 100]"
                      :key="p"
                      dense
                      flat
                      size="xs"
                      :color="(effortCompletionPercentage || 0) === p ? 'primary' : 'grey-7'"
                      :label="p + '%'"
                      @click="effortCompletionPercentage = p"
                    />
                  </div>
                </div>
              </div>

              <!-- Spending & Due Date -->
              <div class="row q-col-gutter-sm items-start q-mb-sm">
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model.number="estSpending"
                    :label="$t('estSpending')"
                    type="number"
                    step="any"
                    dense
                    :suffix="currentOrg.currency"
                    :rules="[(val) => val == null || val >= 0 || 'Should be at least 0']"
                    filled
                    debounce="500"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model.number="spentAmount"
                    :label="$t('spentAmount')"
                    type="number"
                    step="any"
                    dense
                    :suffix="currentOrg.currency"
                    :rules="[(val) => val == null || val >= 0 || 'Should be at least 0']"
                    filled
                    debounce="500"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model="dueDate"
                    dense
                    filled
                    :label="$t('targetDueDate')"
                    mask="####-##-##"
                  >
                    <template v-slot:append>
                      <q-icon name="event" class="cursor-pointer">
                        <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                          <q-date v-model="dueDate" mask="YYYY-MM-DD">
                            <div class="row items-center justify-end">
                              <q-btn v-close-popup :label="$t('Close')" color="primary" flat />
                            </div>
                          </q-date>
                        </q-popup-proxy>
                      </q-icon>
                    </template>
                  </q-input>
                </div>
              </div>

              <!-- Cost Summary Chips -->
              <div class="row q-gutter-sm items-center bg-white q-pa-sm rounded-borders border">
                <div class="col text-caption">
                  <span class="text-grey-7">{{ $t("sunkenCostLabel") }}:</span>
                  <span class="text-weight-bold text-grey-9 q-ml-xs">
                    {{ formatNumber(directCost ? directCost.sunken : 0, 2) }} {{ currentOrg.currency }}
                  </span>
                </div>
                <q-separator vertical />
                <div class="col text-caption">
                  <span class="text-grey-7">{{ $t("outstandingCostLabel") }}:</span>
                  <span class="text-weight-bold text-primary q-ml-xs">
                    {{ formatNumber(directCost ? directCost.outstanding : 0, 2) }} {{ currentOrg.currency }}
                  </span>
                </div>
              </div>
            </q-card-section>
          </q-card>

          <!-- SROI (Social Return on Investment) Analysis Card -->
          <q-card flat bordered class="q-mt-md bg-grey-1 rounded-borders">
            <q-card-section class="q-pb-xs">
              <div class="row items-center justify-between">
                <div>
                  <div class="text-subtitle1 text-weight-bold text-positive row items-center">
                    <q-icon name="volunteer_activism" class="q-mr-xs" size="20px" />
                    {{ $t("sroiCardTitle") }}
                  </div>
                  <div class="text-caption text-grey-7">
                    {{ $t("sroiCardSubtitle") }}
                  </div>
                </div>
                <div class="row items-center q-gutter-xs">
                  <q-chip
                    dense
                    color="positive"
                    text-color="white"
                    class="text-weight-bolder"
                  >
                    SROI {{ formatSroiRatio(actionSroiMetrics.sroiRatio) }}
                  </q-chip>
                  <q-btn
                    outline
                    dense
                    no-caps
                    size="sm"
                    color="primary"
                    icon="table_chart"
                    :label="$t('viewSroiImpactMap')"
                    @click="showSroiModal = true"
                  />
                </div>
              </div>
            </q-card-section>

            <q-card-section class="q-pt-xs q-pb-sm">
              <!-- Social Value Metrics Row -->
              <div class="row q-col-gutter-sm q-mb-sm">
                <div class="col-12 col-sm-4">
                  <div class="bg-white q-pa-xs rounded-borders border text-center">
                    <div class="text-caption text-grey-7">{{ $t("grossSocialBenefit") }}</div>
                    <div class="text-weight-bold text-grey-9">
                      {{ formatNumber(actionSroiMetrics.grossSocialBenefitNpv, 2) }} {{ currentOrg.currency }}
                    </div>
                  </div>
                </div>
                <div class="col-12 col-sm-4">
                  <div class="bg-white q-pa-xs rounded-borders border text-center">
                    <div class="text-caption text-grey-7">{{ $t("netImpactShare") }}</div>
                    <div class="text-weight-bold text-primary">
                      {{ (actionSroiMetrics.adjustmentFactor * 100).toFixed(1) }}%
                    </div>
                  </div>
                </div>
                <div class="col-12 col-sm-4">
                  <div class="bg-white q-pa-xs rounded-borders border text-center">
                    <div class="text-caption text-grey-7">{{ $t("netSocialValue") }}</div>
                    <div class="text-weight-bold text-positive">
                      {{ formatNumber(actionSroiMetrics.netSocialBenefitNpv, 2) }} {{ currentOrg.currency }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- SROI Adjustment Inputs -->
              <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
                {{ $t("sroiDeductionsTitle") }}
              </div>
              <div class="row q-col-gutter-sm items-start">
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model.number="deadweight"
                    type="number"
                    dense
                    filled
                    suffix="%"
                    :label="$t('deadweightLabel')"
                    :hint="$t('deadweightHint')"
                    :rules="[(val) => val == null || (val >= 0 && val <= 100) || '0 - 100%']"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model.number="attribution"
                    type="number"
                    dense
                    filled
                    suffix="%"
                    :label="$t('attributionLabel')"
                    :hint="$t('attributionHint')"
                    :rules="[(val) => val == null || (val >= 0 && val <= 100) || '0 - 100%']"
                  />
                </div>
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model.number="displacement"
                    type="number"
                    dense
                    filled
                    suffix="%"
                    :label="$t('displacementLabel')"
                    :hint="$t('displacementHint')"
                    :rules="[(val) => val == null || (val >= 0 && val <= 100) || '0 - 100%']"
                  />
                </div>
              </div>
            </q-card-section>
          </q-card>

          <sroi-impact-map-modal
            v-model="showSroiModal"
            :action="uiAction"
            @updateAdjustments="onSroiAdjustmentsUpdated"
          />

          <q-card-actions align="right">
            <q-btn :label="$t('Save')" color="primary" type="submit" unelevated no-caps />
          </q-card-actions>
        </div>

        <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">
          <!-- middle column -->
          <div class="text-h6">{{ $t("Related actions") }}</div>
          <div class="q-pa-sm q-gutter-sm">
            <action-relationships></action-relationships>
          </div>
          <div class="text-h6">{{ $t("Calculated results") }}</div>
          <q-list bordered separator class="rounded-borders">
            <q-expansion-item
              :label="$t('Impacts from related actions')"
              header-class="text-weight-medium"
            >
              <simpleCostsAndImpacts
                :costsAndImpacts="
                  uiAction.effectiveChainedCostsAndImpactsExcludingSelf
                "
              >
                <!-- <template v-slot:header>Direct costs</template> -->
              </simpleCostsAndImpacts>
            </q-expansion-item>
            <q-expansion-item
              :label="$t('Combined results')"
              header-class="text-weight-medium"
            >
              <q-markup-table flat separator="none">
                <thead>
                  <tr>
                    <th class="text-left">Item</th>
                    <th class="text-right">
                      NPV ({{ currentOrg ? currentOrg.currency : "" }})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Outstanding direct costs</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.outstandingDirectCosts, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw benefit to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalOrgBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw cost to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalOrgCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted benefit to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalOrgBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted cost to organization</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalOrgCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw benefit to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalWorldBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Raw cost to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.rawMarginalWorldCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted benefit to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalWorldBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Adjusted cost to world</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalWorldCostNpv, 3) }}
                    </td>
                  </tr>

                  <tr>
                    <td>Total benefit</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalTotalBenefitNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Total cost</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalTotalCostNpv, 3) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Net total benefit</td>
                    <td class="text-right">
                      {{ formatNumber(uiAction.marginalNetTotalBenefitNpv, 3) }}
                    </td>
                  </tr>
                </tbody>
              </q-markup-table>
            </q-expansion-item>
          </q-list>
        </div>
        <div v-bind:class="{ 'col-6 col-md-3': !embedded, 'col-12': embedded }">
          <select-user
            :label="$t('Responsible')"
            v-model="uiAction.responsiblePerson"
          />
          <select-user
            :label="$t('Accountable')"
            v-model="uiAction.accountablePerson"
          />
          <q-card-actions align="right">
            <q-btn :label="$t('Save')" color="primary" type="submit" unelevated no-caps />
          </q-card-actions>
          <div class="text-h6">Chat</div>
          <chat
            :chatId="uiAction.chatId"
            subjectDocType="action"
            :subjectDocLineage="{ actionId: uiAction.id }"
            :subjectDocTitle="uiAction.title"
          />
        </div>
      </div>
      <div v-if="!embedded" class="text-h6">Simulation results</div>
      <div v-if="!embedded">
        <action-sim-charts />
      </div>

      <decision-brief-modal
        v-model="showDecisionBrief"
        :initialActions="[uiAction]"
      />
      <explain-ranking-modal
        v-model="showExplainRanking"
        :action="uiAction"
        @open-full-brief="showDecisionBrief = true"
      />
    </q-form>
  </div>
</template>

<script>
import { firebaseAuth } from "@/boot/firebase";
import { mapActions, mapMutations, mapGetters, mapState } from "vuex";
import { createHelpers, mapMultiRowFields } from "vuex-map-fields";
import { interpret } from "xstate";
import { actionMachine } from "@/state-machines/machine-action";
import { formatNumber } from "@/utils/util-formatNumber";
import { showErrorMessage } from "@/utils/util-show-error-message";
import idb from "@/api/idb";
import ModalSaveButton from "@/components/Shared/ModalComponents/ModalSaveButton.vue";
import Impacts from "@/components/Impacts/Impacts.vue";
import SimpleCostsAndImpacts from "@/components/Impacts/SimpleCostsAndImpacts.vue";
import CalculatorUi from "@/components/Calc/CalculatorUi.vue";
import ExportCalcResults from "@/components/Calc/ExportCalcResults.vue";
import ActionRelationships from "@/components/Actions/Relationships/ActionRelationships.vue";
import SelectUser from "@/components/Users/SelectUser.vue";
import ActionSimCharts from "@/components/Charts/ActionSimCharts.vue";
import Chat from "@/components/Chats/Chat.vue";
import DecisionBriefModal from "@/components/Actions/Modals/DecisionBriefModal.vue";
import ExplainRankingModal from "@/components/Actions/Modals/ExplainRankingModal.vue";
import SroiImpactMapModal from "@/components/Actions/Modals/SroiImpactMapModal.vue";
import { calculateSroiMetrics, formatSroiRatio } from "@/utils/sroi";

const { mapFields } = createHelpers({
  getterType: "uiAction/getField",
  mutationType: "uiAction/updateUiActionField",
});

export default {
  components: {
    /*"modal-save-button": ModalSaveButton,*/
    impacts: Impacts,
    simpleCostsAndImpacts:
      SimpleCostsAndImpacts,
    "calculator-ui": CalculatorUi,
    "export-calc-results": ExportCalcResults,
    "action-relationships":
      ActionRelationships,
    "select-user": SelectUser,
    "action-sim-charts": ActionSimCharts,
    chat: Chat,
    "decision-brief-modal": DecisionBriefModal,
    "explain-ranking-modal": ExplainRankingModal,
    "sroi-impact-map-modal": SroiImpactMapModal,
  },

  props: ["action"],

  data() {
    return {
      //embedded: false, //whether this component is embedded or a full page
      actionId: null,
      showDecisionBrief: false,
      showExplainRanking: false,
      showSroiModal: false,
      saveFullResults: false,
      saveResultsOnDevice: false,
      showAddRoleCost: false,
      addingRoleCost: false,
      newRoleCost: { name: "", cost: null },
      actionService: interpret(actionMachine),
      actionStateContext: null,
    };
  },

  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("ui", ["selectedActionId"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapState("calcResults", ["resultsOfAction", "baseline"]),
    //...mapState("actions", ["currentAction"]),
    ...mapState("actions", ["matchingActions"]),
    //fields calculated in the uiAction store, for display only
    //(do not modify their values in the component)
    ...mapState("uiAction", [
      "uiAction",
      "uiActionChanged",
      "uiActionChangedFields",
    ]),
    //fields for 2-way sync between component and store
    ...mapFields([
      "uiAction.title",
      "uiAction.actionMchState",
      "uiAction.useSimpleEstimateMethod",
      "uiAction.simpleEstimateTotalBenefit",
      "uiAction.simpleEstimateTotalBenefitNotes",
      "uiAction.simpleEstimateOtherCosts",
      "uiAction.simpleEstimatseOtherCostsNotes",
      "uiAction.estEffortHrs",
      "uiAction.effortCompletionPercentage",
      "uiAction.effortCostPerHrType",
      "uiAction.customEffortCostPerHr",
      "uiAction.effortCostNodeId",
      "uiAction.estSpending",
      "uiAction.spentAmount",
      "uiAction.ownDirectCost",
      "uiAction.outstandingDirectCost",
      "uiAction.sunkenDirectCost",
      "uiAction.outstandingDirectEffortHrs",
      "uiAction.outstandingDirectEffortCost",
      "uiAction.outstandingSpending",
      "uiAction.dueDate",
      "uiAction.deadweight",
      "uiAction.attribution",
      "uiAction.displacement",
      "uiAction.notes",
      "uiAction.responsiblePerson",
      "uiAction.accountablePerson",
      "uiAction.chatId",
    ]),
    ...mapMultiRowFields(["uiAction.impacts"]),

    embedded() {
      if (this.$route && this.$route.params && this.$route.params.actionId) {
        return false;
      }
      return !!this.selectedActionId;
    },

    completedWorkHours() {
      const hrs = Number(this.estEffortHrs) || 0;
      const pct = Number(this.effortCompletionPercentage) || 0;
      return (hrs * pct) / 100;
    },

    hoursProgressRatio() {
      const pct = Number(this.effortCompletionPercentage) || 0;
      return Math.min(1, Math.max(0, pct / 100));
    },

    spendingProgressRatio() {
      const est = Number(this.estSpending) || 0;
      const spent = Number(this.spentAmount) || 0;
      if (est <= 0) return 0;
      return spent / est;
    },

    actionSroiMetrics() {
      return calculateSroiMetrics(this.uiAction, {
        deadweight: this.deadweight,
        attribution: this.attribution,
        displacement: this.displacement
      });
    },

    isOverBudget() {
      const est = Number(this.estSpending) || 0;
      const spent = Number(this.spentAmount) || 0;
      return spent > est && est > 0;
    },

    progressChipColor() {
      const pct = Number(this.effortCompletionPercentage) || 0;
      if (pct >= 100) return "positive";
      if (pct > 0) return "primary";
      return "grey-6";
    },

    budgetVarianceColor() {
      if (this.isOverBudget) return "negative";
      return "positive";
    },

    budgetVarianceText() {
      const spent = Number(this.spentAmount) || 0;
      const est = Number(this.estSpending) || 0;
      const diff = est - spent;
      const cur = this.currentOrg?.currency || "";
      if (diff < 0) {
        return `${this.$t("budgetOverrun")}: ${formatNumber(Math.abs(diff), 2)} ${cur}`;
      }
      return `${this.$t("remainingBudget")}: ${formatNumber(diff, 2)} ${cur}`;
    },

    // Factors that hold the hourly cost of a role or person.
    roleCostNodes() {
      return this.nodes
        .filter((node) => node.isHourlyCost)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    effortCostOptions() {
      const unit = this.averageEffortCostPerHourNode
        ? this.averageEffortCostPerHourNode.unit
        : "";
      const amount = (node) => {
        const value = this.hourlyCostOf(node);
        return isNaN(value) ? "" : ` (${formatNumber(value, 3)} ${node.unit || unit})`;
      };
      return [
        {
          label:
            this.$t("Use the organization's hourly cost of work") +
            (this.averageEffortCostPerHourNode ? amount(this.averageEffortCostPerHourNode) : ""),
          value: "use_average",
        },
        ...this.roleCostNodes.map((node) => ({
          label: node.name + amount(node),
          value: "factor:" + node.id,
        })),
        { label: this.$t("Use a different hourly cost"), value: "use_custom" },
      ];
    },
    // One menu for the three ways to cost an hour of work.
    effortCostChoice: {
      get() {
        if (this.effortCostPerHrType == "use_factor" && this.effortCostNodeId)
          return "factor:" + this.effortCostNodeId;
        return this.effortCostPerHrType || "use_average";
      },
      set(choice) {
        if (choice.startsWith("factor:")) {
          this.effortCostPerHrType = "use_factor";
          this.effortCostNodeId = choice.slice("factor:".length);
        } else {
          this.effortCostPerHrType = choice;
          this.effortCostNodeId = null;
        }
      },
    },
    // The hourly cost the action's effort is priced at, as the calculation
    // will use it.
    effortCostPerHourInUse() {
      if (this.effortCostPerHrType == "use_custom")
        return Number(this.customEffortCostPerHr) || 0;
      if (this.effortCostPerHrType == "use_factor") {
        const node = this.nodes.find((n) => n.id == this.effortCostNodeId);
        const value = this.hourlyCostOf(node);
        if (!isNaN(value)) return value;
      }
      return this.hourlyCostOf(this.averageEffortCostPerHourNode);
    },

    averageEffortCostPerHourNode() {
      return this.nodes.find(
        (node) =>
          node.id == this.currentModel.roleNodes.averageEffortCostPerHour
      );
    },

    directCost() {
      if (this.currentModel == null || this.nodes.length == 0) return;
      let effortCostPerHour = this.effortCostPerHourInUse;
      let directEffortCost =
        (isNaN(this.estEffortHrs) ? 0 : this.estEffortHrs) * effortCostPerHour;
      let outstandingDirectEffortHrs =
        (isNaN(this.estEffortHrs) ? 0 : this.estEffortHrs) *
        (100 -
          (isNaN(this.effortCompletionPercentage)
            ? 0
            : this.effortCompletionPercentage)) *
        0.01;
      let outstandingDirectEffortCost =
        outstandingDirectEffortHrs * effortCostPerHour;
      let outstandingSpending =
        (isNaN(this.estSpending) ? 0 : this.estSpending) -
        (isNaN(this.spentAmount) ? 0 : this.spentAmount);
      let ownDirectCost =
        directEffortCost + (isNaN(this.estSpending) ? 0 : this.estSpending);
      let outstandingDirectCost =
        outstandingDirectEffortCost + outstandingSpending;
      let directCost = {
        own: ownDirectCost,
        outstanding: outstandingDirectCost,
        sunken: ownDirectCost - outstandingDirectCost,
        outstandingDirectEffortHrs,
        outstandingDirectEffortCost,
        outstandingSpending,
      };
      return directCost;
    },
  },

  methods: {
    // A factor's value at the start of the last calculation, or its formula
    // if it is a plain number and the model hasn't been calculated yet.
    hourlyCostOf(node) {
      if (!node) return NaN;
      const values = this.baseline && this.baseline.nodesValues && this.baseline.nodesValues[node.id];
      if (values && typeof values[0] == "number") return values[0];
      return Number(node.symbolFormula);
    },
    openAddRoleCost() {
      if (this.$refs.effortCostSelect) this.$refs.effortCostSelect.hidePopup();
      this.newRoleCost = { name: "", cost: null };
      this.showAddRoleCost = true;
    },
    async addRoleCost() {
      this.addingRoleCost = true;
      try {
        const nodeId = await this.$store.dispatch("model/addHourlyCostFactor", {
          modelId: this.currentModel.id,
          name: this.newRoleCost.name.trim(),
          cost: this.newRoleCost.cost,
          unit: this.averageEffortCostPerHourNode ? this.averageEffortCostPerHourNode.unit : "",
        });
        this.effortCostChoice = "factor:" + nodeId;
        this.showAddRoleCost = false;
      } catch (error) {
        showErrorMessage(this.$t("Add a role or person's hourly cost"), error.message);
      } finally {
        this.addingRoleCost = false;
      }
    },
    ...mapActions("model", ["updateAction"]),
    ...mapMutations("uiAction", ["mergeNewActionToUiAction"]),
    formatNumber,
    formatSroiRatio,

    onSroiAdjustmentsUpdated({ deadweight, attribution, displacement }) {
      this.deadweight = deadweight;
      this.attribution = attribution;
      this.displacement = displacement;
    },

    async loadAction(newAction) {
      // Start with the machine's initial context
      this.actionStateContext = actionMachine.context;

      //start actionService
      this.actionService
        .onTransition((state) => {
          // Update the current state component data property with the next state
          this.actionMchState = state;
          this.$store.commit("uiAction/setActionMchState", state);

          // Update the context component data property with the updated context
          this.actionStateContext = state.context;
        })
        .start();
      this.$store.dispatch("uiAction/setUiAction", {
        id: newAction.id,
        ...newAction,
      });
      this.saveResultsOnDevice = await idb.getSaveResultsOnDeviceForAction(
        newAction.id
      );

      // Start with saved state or the machine's initial state
      if (!this.uiAction.actionMchState.hasOwnProperty("value")) {
        this.$store.commit(
          "uiAction/setActionMchState",
          actionMachine.initialState
        );
        //console.log("set to initial state: ", this.uiAction.actionMchState);
      } else {
        //console.log("existing state: ", this.uiAction.actionMchState);
      }
    },
    submitForm() {
      this.$refs.actionTitle.validate();
      if (!this.$refs.actionTitle.hasError) {
        this.submitAction();
      }
    },
    submitAction() {
      //remove fields not meant to be updated
      let updates = JSON.parse(JSON.stringify(this.uiAction));
      let propertiesToDelete = [
        "actionLeverage",
        "actionRoi",
        "totalRoi",
        "blockeeActionIds",
        "blockerActionIds",
        "childrenActionIds",
        "parentActionId",
        "effectiveChainedCostsAndImpacts",
        "effectiveChainedCostsAndImpactsExcludingSelf",
      ];
      propertiesToDelete.forEach(
        (propertyName) => delete updates[propertyName]
      );

      let payload = {
        id: this.action.id,
        updates,
      };
      this.$store.dispatch("actions/updateAction", payload);
      this.$store.commit("uiAction/setUiActionChanged", false);
    },
    setSaveResultsOnDeviceForAction(actionId, val) {
      idb.setSaveResultsOnDeviceForAction(actionId, val);
    },
  },

  created() {
    (async () => {
      while (
        !firebaseAuth.currentUser // define the condition as you like
      ) {
        //console.log("waiting for currentUser to be defined");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      let orgId = this.$route.params.orgId;
      let modelId = this.$route.params.orgId;
      this.$store.dispatch("model/bindCurrentModel", modelId);
      this.$store.dispatch("model/bindNodes", modelId);
    })();
  },

  mounted() {
    this.loadAction(this.action);
  },

  unmounted() {
    this.actionService.stop();
  },
  watch: {
    action: {
      deep: true,
      handler(newAction, oldAction) {
        if (
          //action first loaded OR changed from another action
          (newAction && !oldAction) ||
          (newAction && newAction.id != oldAction.id)
        ) {
          console.log(`${newAction.id} / ${oldAction.id}`);
          this.loadAction(newAction);
          this.saveFullResults = false;
        } else if (newAction) {
          //same action, just refreshed
          this.$store.commit("uiAction/mergeNewActionToUiAction", newAction);
        } else {
          this.$store.dispatch("uiAction/setUiAction", null);
          console.log("no new action, setUiAction to null");
        }
      },
    },

    directCost: function () {
      if (typeof this.directCost == "undefined") return;
      this.ownDirectCost = this.directCost.own;
      this.outstandingDirectCost = this.directCost.outstanding;
      this.sunkenDirectCost = this.directCost.sunken;
      this.outstandingDirectEffortHrs =
        this.directCost.outstandingDirectEffortHrs;
      this.outstandingDirectEffortCost =
        this.directCost.outstandingDirectEffortCost;
      this.outstandingSpending = this.directCost.outstandingSpending;
    },
  },
};
</script>
