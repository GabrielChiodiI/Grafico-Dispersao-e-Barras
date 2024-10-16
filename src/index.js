const d3 = require('d3');
const dscc = require('@google/dscc');
const local = require('./localMessage.js');

// Definir se estamos em desenvolvimento local
export const LOCAL = true;

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
}

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

// Função para criar escalas X e Y para o gráfico de barras (usando datas no eixo X)
const createBarScales = (data, chartWidth, chartHeight) => {
  const xScale = d3.scaleBand()
    .domain(data.map(d => d.temporalDimension[0]))
    .range([0, chartWidth])
    .padding(0.2);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(data.map(d => d.metric[0]))])
    .range([0, chartHeight]);  // Inverter Y para que as barras cresçam de cima para baixo

  return { xScale, yScale };
};

// Função para arredondar o valor máximo para o próximo intervalo "adequado"
const roundUpToNearest = (value) => {
  if (value <= 0.05) return 0.05;
  if (value <= 0.1) return 0.1;
  if (value <= 0.5) return 0.5;
  if (value <= 1) return 1;
  return Math.ceil(value * 10) / 10; // Arredonda para o próximo múltiplo de 0.1
};

// Função para criar escalas X e Y para o gráfico de dispersão (temporalDimension no eixo X)
const createScatterScales = (data, chartWidth, chartHeight, message) => {
  const xScale = d3.scaleBand()
    .domain(data.map(d => d.temporalDimension[0]))  // Usar temporalDimension como X (datas)
    .range([0, chartWidth])
    .padding(0.2);

  // Filtrar os dados para considerar apenas os valores dentro dos limites configurados
  const scatterFilter2 = parseFloat(message.style.scatterFilter2.value) || parseFloat(message.style.scatterFilter2.defaultValue);
  const scatterFilter1 = parseFloat(message.style.scatterFilter1.value) || parseFloat(message.style.scatterFilter1.defaultValue);
  const filteredData = data.filter(d => {
    const metricValue = d.metric1[0];
    return metricValue >= scatterFilter2 && metricValue <= scatterFilter1;
  });

  // Encontrar o valor máximo nos dados filtrados
  const maxDataValue = d3.max(filteredData, d => d.metric1[0]) || 0;
  
  // Arredondar o valor máximo para o próximo intervalo "adequado"
  const roundedMaxValue = roundUpToNearest(maxDataValue);

  // Criar a escala Y partindo de 0 até o valor arredondado
  const yScale = d3.scaleLinear()
    .domain([0, roundedMaxValue])  // Partindo de 0 até o valor arredondado máximo
    .range([chartHeight, 0]);  // Crescimento de baixo para cima

  return { xScale, yScale };
};

// Função para desenhar os eixos Y com intervalos de 20% do valor arredondado
const drawYAxis = (svg, yScale, chartHeight) => {
  svg.append("g")
    .call(d3.axisLeft(yScale)
      .ticks(5) // Dividir em 5 intervalos
      .tickFormat(d3.format(".1f"))) // Formato de exibição com 1 casa decimal
    .attr("transform", `translate(0, 0)`);
};

// Função para desenhar o gráfico de barras (precipitação de chuva)
const drawBars = (svg, data, xScale, yScale, chartHeight, barColor, message) => {
  svg.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", d => xScale(d.temporalDimension[0]))
    .attr("y", 0)  // Inicia no topo
    .attr("width", xScale.bandwidth())
    .attr("height", d => yScale(d.metric[0]))  // Crescimento para baixo
    .attr("fill", barColor)
    .on("click", (event, d) => click(d, message))  // Adicionar comportamento de clique
    .on("mouseover", function (event, d) {
      tooltip
        .html(buildTooltip(d, message.fields, "barras"))  // Atualizar tooltip para gráfico de barras
        .style("opacity", 1);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
    });
};

// Função para desenhar o gráfico de dispersão (concentração de agrotóxicos)
const drawScatter = (svg, data, xScale, yScale, message) => {
  // Escala de cores para diferentes agrotóxicos
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
    .domain(data.map(d => d.metric2[0]));

  const showNulls = (message.style.scatterFilter3.value === "true") || (message.style.scatterFilter3.defaultValue === "true");

  // Filtrar os dados para manter apenas os valores dentro dos limites configurados
  const scatterFilter2 = parseFloat(message.style.scatterFilter2.value) || parseFloat(message.style.scatterFilter2.defaultValue);
  const scatterFilter1 = parseFloat(message.style.scatterFilter1.value) || parseFloat(message.style.scatterFilter1.defaultValue);
  const filteredData = data.filter(d => {
    const metricValue = d.metric1[0];
    return (showNulls || metricValue !== null) &&
      metricValue >= scatterFilter2 && metricValue <= scatterFilter1;
  });

  svg.selectAll("circle")
    .data(filteredData)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.temporalDimension[0]) + xScale.bandwidth() / 2)
    .attr("cy", d => yScale(d.metric1[0]))
    .attr("r", 5)
    .attr("fill", d => colorScale(d.metric2[0]))
    .on("click", (event, d) => click(d, message))
    .on("mouseover", function (event, d) {
      tooltip
        .html(buildTooltip(d, message.fields, "dispersao"))
        .style("opacity", 1);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
    });
};

// Função principal para desenhar as visualizações
const drawViz = (message) => {
  const margin = { left: 60, right: 20, top: 20, bottom: 40 };

  const height = dscc.getHeight();
  const width = dscc.getWidth();

  const barChartHeight = height * 0.35 - margin.top - margin.bottom;  // 35% para o gráfico de barras
  const scatterChartHeight = height * 0.65 - margin.top - margin.bottom;  // 65% para o gráfico de dispersão
  const chartWidth = width - margin.left - margin.right;

  // Limpar qualquer gráfico SVG existente
  d3.select("body").selectAll("svg").remove();

  // Criar o SVG geral
  const svg = d3.select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Dados e escalas para o gráfico de barras (precipitação de chuva)
  const barData = message.tables.DEFAULT;
  const { xScale: barXScale, yScale: barYScale } = createBarScales(barData, chartWidth, barChartHeight);
  const barColor = styleVal(message, "barColor");

  // Adicionar o gráfico de barras na parte superior
  const barSvg = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  drawBars(barSvg, barData, barXScale, barYScale, barChartHeight, barColor, message);

  // Adicionar eixos ao gráfico de barras
  barSvg.append("g")
    .attr("transform", `translate(0, ${barChartHeight})`)
    .call(d3.axisBottom(barXScale));

  barSvg.append("g")
    .call(d3.axisLeft(barYScale));

  // Dados e escalas para o gráfico de dispersão (concentração de agrotóxicos)
  const scatterData = message.tables.DEFAULT;
  const { xScale: scatterXScale, yScale: scatterYScale } = createScatterScales(scatterData, chartWidth, scatterChartHeight, message);

  // Adicionar o gráfico de dispersão na parte inferior
  const scatterSvg = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top + barChartHeight + margin.bottom})`);

  drawScatter(scatterSvg, scatterData, scatterXScale, scatterYScale, message);

  // Adicionar eixos ao gráfico de dispersão
  scatterSvg.append("g")
    .attr("transform", `translate(0, ${scatterChartHeight})`)
    .call(d3.axisBottom(scatterXScale));

  scatterSvg.append("g")
    .call(d3.axisLeft(scatterYScale));
};

// Renderizar localmente ou no Google Data Studio
if (LOCAL) {
  drawViz(local.message);
} else {
  dscc.subscribeToData(drawViz, { transform: dscc.objectTransform });
}
