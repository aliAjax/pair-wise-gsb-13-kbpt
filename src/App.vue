<script setup lang="ts">
import { computed, ref } from "vue";
import DisposalPanel from "./components/DisposalPanel.vue";
import EntryForm from "./components/EntryForm.vue";
import EntryList from "./components/EntryList.vue";
import FuelBoard from "./components/FuelBoard.vue";
import VersionTimeline from "./components/VersionTimeline.vue";
import { useReleaseStore } from "./stores/releaseStore";

const store = useReleaseStore();

const tabs = ["班次记录", "处置单", "版本经历"] as const;
const activeTab = ref<(typeof tabs)[number]>("班次记录");
const fuelFilter = ref("");

const metrics = computed(() => [
  { label: "登记班次", value: store.entries.length },
  { label: "停发油品", value: store.fuels.filter((fuel) => store.isSuspended(fuel.code)).length },
  { label: "待处置单", value: store.disposals.filter((order) => order.status === "待处置").length },
  { label: "已复核冻结", value: store.entries.filter((entry) => entry.status === "已复核").length },
]);

function resetDemo() {
  if (!window.confirm("将清空本地数据并恢复演示班次，确定重置？")) return;
  store.resetDemo();
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 班次交接升级</p>
          <h1>加油站油品放行台</h1>
          <p class="subtitle">
            按油品登记罐号、液位、水高、温度与油枪累计数，自动衔接上一班实测库存；
            水高超限或温度换算后库存差异超限即停发并生成处置单，登记抽水回罐量、复测值与复核人后方可恢复发油。
          </p>
        </div>
        <div class="stack">
          <span v-for="item in ['Vue3', 'Vite', 'TypeScript', 'Element Plus', 'Pinia']" :key="item" class="tag">
            {{ item }}
          </span>
          <button class="secondary" type="button" @click="resetDemo">重置演示数据</button>
        </div>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <FuelBoard />

      <section class="workspace">
        <EntryForm />

        <section class="list-panel">
          <div class="toolbar">
            <div class="tabs">
              <button
                v-for="tab in tabs"
                :key="tab"
                type="button"
                class="tab"
                :class="{ active: activeTab === tab }"
                @click="activeTab = tab"
              >
                {{ tab }}
              </button>
            </div>
            <select v-model="fuelFilter" class="fuel-filter">
              <option value="">全部油品</option>
              <option v-for="fuel in store.fuels" :key="fuel.code" :value="fuel.code">
                {{ fuel.name }}
              </option>
            </select>
          </div>

          <EntryList v-if="activeTab === '班次记录'" :fuel-code="fuelFilter" />
          <DisposalPanel v-else-if="activeTab === '处置单'" :fuel-code="fuelFilter" />
          <VersionTimeline v-else :fuel-code="fuelFilter" />
        </section>
      </section>
    </div>
  </main>
</template>
