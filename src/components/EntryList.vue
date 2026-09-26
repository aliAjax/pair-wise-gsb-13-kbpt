<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { SHIFTS, fuelByCode } from "../data/fuels";
import type { EntryValues, ShiftEntry, ShiftName } from "../domain/types";
import { useReleaseStore } from "../stores/releaseStore";
import { fmtLiters, fmtPct, fmtTime } from "./format";

const props = defineProps<{ fuelCode: string }>();
const store = useReleaseStore();

const list = computed(() => store.sortedEntries(props.fuelCode || undefined));

function fuelName(code: string) {
  return fuelByCode(code).name;
}

function tankNo(code: string) {
  return fuelByCode(code).tank.tankNo;
}

function review(entry: ShiftEntry) {
  const result = store.reviewEntry(entry.id);
  if (result.ok) ElMessage.success("班次已复核并冻结，后续修改需走补充更正");
  else ElMessage.error(result.error);
}

function remove(entry: ShiftEntry) {
  const result = store.removeEntry(entry.id);
  if (result.ok) ElMessage.success("已撤销该待复核记录");
  else ElMessage.error(result.error);
}

const dialogVisible = ref(false);
const correcting = ref<ShiftEntry | null>(null);
const correction = reactive({
  businessDate: "",
  shift: "早班" as ShiftName,
  levelMm: 0,
  waterCm: 0,
  tempC: 20,
  nozzleTotal: 0,
  operator: "",
  note: "",
  reason: "",
  changedBy: "",
});

function openCorrection(entry: ShiftEntry) {
  correcting.value = entry;
  Object.assign(correction, { ...entry.values, reason: "", changedBy: "" });
  dialogVisible.value = true;
}

function saveCorrection() {
  const entry = correcting.value;
  if (!entry) return;
  const values: EntryValues = {
    businessDate: correction.businessDate,
    shift: correction.shift,
    levelMm: Number(correction.levelMm) || 0,
    waterCm: Number(correction.waterCm) || 0,
    tempC: Number(correction.tempC) || 0,
    nozzleTotal: Number(correction.nozzleTotal) || 0,
    operator: correction.operator.trim(),
    note: correction.note.trim(),
  };
  const result = store.correctEntry(entry.id, values, correction.reason, correction.changedBy);
  if (!result.ok) {
    ElMessage.error(result.error);
    return;
  }
  ElMessage.success(`已另存为 v${entry.version}，旧值保留在版本经历中`);
  dialogVisible.value = false;
}
</script>

<template>
  <div class="record-grid">
    <div v-if="list.length === 0" class="empty">暂无交接记录</div>
    <article v-for="entry in list" :key="entry.id" class="record">
      <div class="record-head">
        <p class="record-title">
          {{ fuelName(entry.fuelCode) }} · {{ entry.values.businessDate }} {{ entry.values.shift }}
        </p>
        <div class="badges">
          <span v-if="entry.version > 1" class="badge version">v{{ entry.version }} 已更正</span>
          <span class="badge" :class="entry.status === '已复核' ? 'frozen' : 'pending'">
            {{ entry.status === "已复核" ? "已复核·冻结" : "待复核" }}
          </span>
          <span class="badge" :class="entry.verdict.triggers.length > 0 ? 'stop' : 'ok'">
            {{ entry.verdict.triggers.length > 0 ? "停发" : "正常" }}
          </span>
        </div>
      </div>

      <div class="details">
        <span>罐号：{{ tankNo(entry.fuelCode) }}</span>
        <span>液位：{{ entry.values.levelMm }} mm</span>
        <span>水高：{{ entry.values.waterCm }} cm</span>
        <span>温度：{{ entry.values.tempC }} °C</span>
        <span>油枪累计：{{ fmtLiters(entry.values.nozzleTotal) }}</span>
        <span>本班走字：{{ entry.verdict.baselineEntryId ? fmtLiters(entry.verdict.salesLiters) : "首班建账" }}</span>
        <span>实测库存(V20)：{{ fmtLiters(entry.verdict.v20Measured) }}</span>
        <span>账面库存(V20)：{{ entry.verdict.baselineEntryId ? fmtLiters(entry.verdict.v20Book) : "—" }}</span>
        <span :class="{ bad: entry.verdict.triggers.some((t) => t.includes('差异')) }">
          库存差异：{{ entry.verdict.baselineEntryId ? fmtPct(entry.verdict.diffPct) : "—" }}
        </span>
        <span>交班人：{{ entry.values.operator }}</span>
        <span>登记时间：{{ fmtTime(entry.createdAt) }}</span>
        <span v-if="store.disposalForEntry(entry.id)">
          处置单：{{ store.disposalForEntry(entry.id)?.status }}
        </span>
      </div>

      <ul v-if="entry.verdict.triggers.length > 0" class="triggers">
        <li v-for="trigger in entry.verdict.triggers" :key="trigger">{{ trigger }}</li>
      </ul>
      <p v-if="entry.values.note" class="note">{{ entry.values.note }}</p>

      <div class="actions">
        <button v-if="entry.status === '待复核'" type="button" @click="review(entry)">复核通过</button>
        <button v-else type="button" @click="openCorrection(entry)">补充更正</button>
        <button
          v-if="entry.status === '待复核'"
          class="danger"
          type="button"
          @click="remove(entry)"
        >
          撤销记录
        </button>
      </div>
    </article>

    <el-dialog v-model="dialogVisible" title="补充更正（冻结班次）" width="520px">
      <p class="dialog-tip">
        当前值将另存为 v{{ (correcting?.version ?? 1) + 1 }}，v{{ correcting?.version ?? 1 }}
        旧值保留在版本经历中，更正后重新判定库存差异。
      </p>
      <div class="form-grid">
        <div class="field-row">
          <label>
            营业日
            <input v-model="correction.businessDate" type="date" required />
          </label>
          <label>
            班次
            <select v-model="correction.shift">
              <option v-for="shift in SHIFTS" :key="shift" :value="shift">{{ shift }}</option>
            </select>
          </label>
        </div>
        <div class="field-row">
          <label>
            液位（mm）
            <input v-model="correction.levelMm" type="number" min="0" step="1" required />
          </label>
          <label>
            水高（cm）
            <input v-model="correction.waterCm" type="number" min="0" step="0.1" required />
          </label>
        </div>
        <div class="field-row">
          <label>
            温度（°C）
            <input v-model="correction.tempC" type="number" step="0.1" required />
          </label>
          <label>
            油枪累计数（L）
            <input v-model="correction.nozzleTotal" type="number" min="0" step="1" required />
          </label>
        </div>
        <label>
          交班人
          <input v-model="correction.operator" type="text" required />
        </label>
        <label>
          备注
          <textarea v-model="correction.note" />
        </label>
        <label>
          更正原因（必填）
          <input v-model="correction.reason" type="text" placeholder="说明为何更正" />
        </label>
        <label>
          更正人（必填）
          <input v-model="correction.changedBy" type="text" placeholder="填写更正人姓名" />
        </label>
      </div>
      <template #footer>
        <button class="secondary" type="button" @click="dialogVisible = false">取消</button>
        <button type="button" @click="saveCorrection">另存新版本</button>
      </template>
    </el-dialog>
  </div>
</template>
