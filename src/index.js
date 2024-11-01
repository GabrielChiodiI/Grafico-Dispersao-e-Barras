const d3 = require('d3');
const dscc = require('@google/dscc');
const local = require('./localMessage.js');

// Definir se estamos em desenvolvimento local
export const LOCAL = true;

// Função para formatar dinamicamente os rótulos do eixo Y
const autoFormat = (yScale) => {
  const maxValue = yScale.domain()[1]; // Valor máximo da escala Y

  if (maxValue >= 1) {
    // Se o valor máximo for maior ou igual a 1, usar 2 casas decimais
    return d3.format(".2f");
  } else {
    // Caso contrário, ajustar o número de casas decimais dinamicamente
    const precision = Math.ceil(-Math.log10(maxValue)) + 2;
    return d3.format(`.${precision}f`);
  }
};

// Função para calcular os filtros de dispersão
const getScatterFilters = (message) => {
  // Verifica se o valor foi configurado e não é undefined
  const scatterFilter2 = message.style.scatterFilter2.value !== undefined
    ? parseFloat(message.style.scatterFilter2.value)
    : (message.style.scatterFilter2.defaultValue !== undefined
        ? parseFloat(message.style.scatterFilter2.defaultValue)
        : -Infinity);

  const scatterFilter1 = message.style.scatterFilter1.value !== undefined
    ? parseFloat(message.style.scatterFilter1.value)
    : (message.style.scatterFilter1.defaultValue !== undefined
        ? parseFloat(message.style.scatterFilter1.defaultValue)
        : Infinity);

  return { scatterFilter1, scatterFilter2 };
};

// Função para construir a tooltip
const buildTooltip = (d, fields, chartType) => {
  const temporalDim = `Data: ${d.temporalDimension[0]}`;  // Usar temporalDimension para exibir a data
  if (chartType === "barras") {
    const met = `Precipitação: ${d.metric[0]}`;  // Usar metric para exibir a precipitação
    return `${temporalDim}<br> ${met}`;
  } else if (chartType === "dispersao") {
    const metX = `Agrotóxico: ${d.metric2[0]}`;  // metric2 para exibir o tipo de agrotóxico
    const metY = `Concentração: ${d.metric1[0]}`;  // metric1 para exibir a concentração de agrotóxico
    return `${temporalDim}<br> ${metX}<br> ${metY}`;
  }
  return temporalDim;
};

// Criar a div da tooltip no corpo do documento
const tooltip = d3.select("body")
  .append("div")
  .style("position", "absolute")
  .style("background", "#f9f9f9")
  .style("padding", "5px")
  .style("border", "1px solid #ccc")
  .style("border-radius", "5px")
  .style("box-shadow", "0px 0px 2px rgba(0,0,0,0.5)")
  .style("pointer-events", "none")
  .style("opacity", 0);  // Inicialmente invisível

// Função para obter o valor do estilo configurado pelo usuário
const styleVal = (message, styleId) => {
  if (typeof message.style[styleId].defaultValue === "object") {
    return message.style[styleId].value.color !== undefined
      ? message.style[styleId].value.color
      : message.style[styleId].defaultValue.color;
  }
  return message.style[styleId].value !== undefined
    ? message.style[styleId].value
    : message.style[styleId].defaultValue;
};

// Função de clique com interação de filtro
function click(d, message) {
  const FILTER = dscc.InteractionType.FILTER;
  const actionId = 'onClick';
  let selected = new Set();

  const dimIds = message.fields.temporalDimension.map(d => d.id);  // Dimensão temporal

  if (message.interactions.onClick && message.interactions.onClick.value && message.interactions.onClick.value.data !== undefined) {
    const selVals = message.interactions[actionId].value.data.values.map(d =>
      JSON.stringify(d)
    );
    selected = new Set(selVals);
    const clickData = JSON.stringify(d.temporalDimension);
    if (selected.has(clickData)) {
      selected.delete(clickData);
    } else {
      selected.add(clickData);
    }
  } else {
    const filterData = {
      concepts: dimIds,
      values: [d.temporalDimension],
    };
    dscc.sendInteraction(actionId, FILTER, filterData);
    return;
  }

  if (selected.size > 0) {
    const filterData = {
      concepts: dimIds,
      values: Array.from(selected).map(d => JSON.parse(d)),
    };
    dscc.sendInteraction(actionId, FILTER, filterData);
  } else {
    dscc.clearInteraction(actionId, FILTER);
  }
};

// Escala X Linear baseada em índices dos dados
const createTimeXScale = (data, chartWidth) => {
  return d3.scaleTime()
    .domain(d3.extent(data, d => d.temporalDimension)) // índice dos dados para uma escala contínua
    .range([0, chartWidth]);
};

// Função para desenhar o gráfico de barras (precipitação de chuva)
const drawBars = (svg, data, xScale, yScale, chartWidth, barColor, message) => {
  const bars = svg.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => xScale(d.temporalDimension))
    .attr("y", 0)  // Inicia no topo
    .attr("width",  chartWidth / data.length * 0.8)  // Ajusta o espaçamento entre as barras
    .attr("height", d => yScale(d.metric[0])) 
    .attr("fill", barColor)
    .attr("stroke-width", 0);
};

// Função para criar escalas X e Y para o gráfico de dispersão
const createScatterScales = (data, chartHeight, message) => {
  const { scatterFilter1, scatterFilter2 } = getScatterFilters(message);
  
  // Filtrar os dados para manter apenas os valores dentro dos limites configurados
  const filteredData = data.filter(d => {
    const metricValue = d.metric1[0];
    return metricValue >= scatterFilter2 && metricValue <= scatterFilter1;

  });

  // Identificar a significância e arredondar os valores máximo e mínimo
  const maxDataValue = d3.max(filteredData, d => d.metric1[0]);
  const minDataValue = d3.min(filteredData, d => d.metric1[0]);

  const padding = (maxDataValue - minDataValue) * 0.01;

  // Criar a escala Y partindo do valor mínimo arredondado até o máximo arredondado
  const yScale = d3.scaleLinear()
    .domain([minDataValue - padding, maxDataValue + padding])
    .range([chartHeight, 0]);

  return { yScale, filteredData };
};

// Função para desenhar o gráfico de dispersão
const drawScatter = (svg, filteredData, xScale, yScale, message) => {
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
    .domain(filteredData.map(d => d.metric2[0]));
  const showNulls = (message.style.scatterFilter3.value === "true") ||
    (message.style.scatterFilter3.defaultValue === "true");

  // Função para aplicar jitter ao valor Y
  const jitterAmount = 5; // Ajuste conforme necessário para o deslocamento
  const applyJitter = (yValue) => yValue + (Math.random() - 0.5) * jitterAmount;

  const circles = svg.selectAll("circle")
    .data(filteredData.filter(d => showNulls || d.metric1[0] !== null))
    .join("circle")
    .attr("cx", d => xScale(d.temporalDimension))
    .attr("cy", d => applyJitter(yScale(d.metric1[0]))) // Aplicar jitter ao valor Y
    .attr("r", 5)
    .attr("fill", d => colorScale(d.metric2[0]));
};

// Função principal para desenhar as visualizações
const drawViz = (message) => {
  // Configurações de margem e dimensões
  const margin = { left: 80, right: 10, top: 20, bottom: 20 };
  const height = dscc.getHeight() - margin.top - margin.bottom;
  const width = dscc.getWidth() - margin.left - margin.right;

  // Dimensões para os gráficos de barras e dispersão
  const barChartHeight = height * 0.35 - margin.top - margin.bottom; // 35% para o gráfico de barras
  const scatterChartHeight = height * 0.65 - margin.top - margin.bottom; // 65% para o gráfico de dispersão
  const chartWidth = width - margin.left - margin.right;

  const parseDate = d3.timeParse("%Y%m%d");

    // Convertendo a temporalDimension para Date nos dados
  const data = message.tables.DEFAULT.map(d => ({
    ...d,
    temporalDimension: parseDate(d.temporalDimension[0])
  }));
  const xScale = createTimeXScale(data, chartWidth);
  
  // Limpar qualquer gráfico SVG existente
  d3.select("body").selectAll("svg").remove();

  // Criar o SVG principal
  const svg = d3.select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const barYScale = d3.scaleLinear()
    .domain([0, d3.max(data.map(d => d.metric[0]))])
    .range([barChartHeight, 0]);
  const barColor = styleVal(message, "barColor");

  // Adicionar o grupo para o gráfico de barras
  const barSvg = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  
  // Desenhar o gráfico de barras
  drawBars(barSvg, data, xScale, barYScale, chartWidth, barColor, message);

  // Adicionar eixos ao gráfico de barras
  barSvg.append("g")
    .attr("transform", `translate(0, 0)`)
    .call(d3.axisTop(xScale)
      .tickFormat("")
      .tickSize(0)
    );

  barSvg.append("g")
    .call(d3.axisLeft(barYScale).ticks(5).tickSize(0).tickPadding(10));

  // Dados e escalas para o gráfico de dispersão (concentração de agrotóxicos)
  const {yScale: scatterYScale, filteredData } = createScatterScales(data, scatterChartHeight, message);

  // Adicionar o grupo para o gráfico de dispersão
  const scatterSvg = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top + barChartHeight + margin.bottom})`);
  
  // Desenhar o gráfico de dispersão
  drawScatter(scatterSvg, filteredData, xScale, scatterYScale, message);

  // Adicionar eixo X ao gráfico de dispersão
  scatterSvg.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${scatterChartHeight})`)
    .call(
      d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat("%d/%m/%Y"))
        .tickSize(0)
        .tickPadding(10)
    )
    .selectAll("text")

  scatterSvg.append("g")
    .call(d3.axisLeft(scatterYScale)
      .ticks(5)
      .tickFormat(autoFormat(scatterYScale))
      .tickSize(0)
      .tickPadding(10)) // Usar formatação automática
    .attr("transform", `translate(0, 0)`);

  // Função de zoom
  const zoom = d3.zoom()
    .scaleExtent([1, 10]) // Limites de zoom
    .translateExtent([[0, 0], [chartWidth, height]]) // Limites de translação
    .on("zoom", (event) => {
      // Rescalar xScale com a transformação de zoom
      const newXScale = event.transform.rescaleX(xScale);

      // Redesenhar gráficos com a nova escala transformada
      drawBars(barSvg, data, newXScale, barYScale, chartWidth, barColor, message);
      drawScatter(scatterSvg, filteredData, newXScale, scatterYScale, message);

      // Atualizar eixos x com `d.temporalDimension[0]` para sincronizar datas
      barSvg.select(".x-axis")
        .call(d3.axisBottom(newXScale)
          .tickFormat("")
          .tickSize(0)
        );

      scatterSvg.select(".x-axis")
        .call(d3.axisBottom(newXScale)
          .ticks(Math.min(data.length, 10))
          .tickFormat(d3.timeFormat("%d/%m/%Y"))
        );
    });

  // Aplicar o zoom ao SVG principal
  svg.call(zoom);
};

// Renderizar localmente ou no Google Data Studio
if (LOCAL) {
  drawViz(local.message);
} else {
  dscc.subscribeToData(drawViz, { transform: dscc.objectTransform });
}
