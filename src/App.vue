<script setup lang="ts">
import { computed, ref } from "vue";
import { useReleaseDeskStore } from "./stores/releaseDesk";
import { PRODUCTS } from "./domain/catalog";
import { fmt } from "./utils/format";
import RegisterPanel from "./components/RegisterPanel.vue";
import ReadingCard from "./components/ReadingCard.vue";
import DisposalBoard from "./components/DisposalBoard.vue";
import VersionTimeline from "./components/VersionTimeline.vue";

const stack = ["Vue3", "Vite", "TypeScript", "Element Plus", "Pinia"];
const store = useReleaseDeskStore();

const tabs = ["班次记录", "处置单", "版本经历"] as const;
type Tab = (typeof tabs)[number];
const activeTab = ref<Tab>("班次记录");
const filterCode = ref("all");

const metrics = computed(() => [
  { label: "正常发油油品", value: store.activeCount },
  { label: "停发油品", value: store.blockedCount },
  { label: "待处置单", value: store.openOrderCount },
  { label: "已复核班次", value: store.reviewedCount },
]);

const readings = computed(() => store.sortedReadings(filterCode.value));

const orders = computed(() =>
  store.orders
    .filter((order) => filterCode.value === "all" || order.productCode === filterCode.value)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

const versionList = computed(() =>
  store.versions
    .filter((version) => filterCode.value === "all" || version.productCode === filterCode.value)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

const chartRows = computed(() => [
  { label: "正常发油", value: store.activeCount },
  { label: "停发油品", value: store.blockedCount },
  { label: "待处置单", value: store.openOrderCount },
]);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((row) => row.value)));
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业前端最小闭环</p>
          <h1>加油站油品放行台</h1>
          <p class="subtitle">
            按油品登记罐号、液位、水高、温度与油枪累计数，与上一班实测库存衔接；水高超过
            5cm，或按温度密度换算后的库存差异超过 0.8% 时先停发并生成处置单，登记抽水回罐量、复测值与复核人后恢复。
          </p>
        </div>
        <div class="stack">
          <span v-for="item in stack" :key="item" class="tag">{{ item }}</span>
        </div>
      </header>

      <section class="product-strip">
        <article
          v-for="item in store.productSummaries"
          :key="item.product.code"
          class="product-card"
          :class="{ blocked: item.blocked }"
        >
          <div class="record-head">
            <p class="record-title">{{ item.product.name }}</p>
            <span class="status" :class="item.blocked ? 'status-danger' : ''">
              {{ item.blocked ? "停发" : "正常发油" }}
            </span>
          </div>
          <div class="details">
            <span>罐号: {{ item.product.tankNo }}</span>
            <span>标准密度: {{ item.product.density20 }} kg/L</span>
            <span>
              最新实测:
              {{ item.latest ? `${fmt(item.latest.derived.standardVolumeL, 1)} L` : "未登记" }}
            </span>
            <span>
              最近班次:
              {{ item.latest ? `${item.latest.date} ${item.latest.shift}` : "-" }}
            </span>
          </div>
          <p v-if="item.blocked" class="note danger-note">
            处置单 #{{ item.openOrder?.id.slice(0, 8) }} 未确认，停止发油中。
          </p>
        </article>
      </section>

      <section class="metrics">
        <article v-for="item in metrics" :key="item.label" class="metric">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <RegisterPanel />

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
            <select v-model="filterCode">
              <option value="all">全部油品</option>
              <option v-for="product in PRODUCTS" :key="product.code" :value="product.code">
                {{ product.name }}
              </option>
            </select>
          </div>

          <div v-if="activeTab === '班次记录'" class="record-grid">
            <div v-if="readings.length === 0" class="empty">暂无匹配班次记录</div>
            <ReadingCard v-for="reading in readings" :key="reading.id" :reading="reading" />
          </div>

          <div v-else-if="activeTab === '处置单'" class="record-grid">
            <div v-if="orders.length === 0" class="empty">暂无处置单</div>
            <DisposalBoard v-for="order in orders" :key="order.id" :order="order" />
          </div>

          <VersionTimeline v-else :versions="versionList" />

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.label" class="bar">
              <span>{{ row.label }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" />
              </div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
