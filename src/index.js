const d3 = require('d3');
const dscc = require('@google/dscc');
const local = require('./localMessage.js');

// Definir se estamos em desenvolvimento local
export const LOCAL = true;

// Função para formatar a data de 'YYYYMMDD' para 'DD/MM/YYYY'
const formatDate = (dateStr) => {
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${day}/${month}/${year}`;
};

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
}

// Escala X Linear baseada em índices dos dados
const createLinearXScale = (data, chartWidth) => {
  return d3.scaleLinear()
    .domain([0, data.length - 1]) // índice dos dados para uma escala contínua
    .range([0, chartWidth]);
};

// Função para desenhar o gráfico de barras (precipitação de chuva)
const drawBars = (svg, data, xScale, yScale, chartWidth, barColor, message) => {
  const bars = svg.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d, i) => xScale(i))
    .attr("y", 0)  // Inicia no topo
    .attr("width", chartWidth / barData.length * 0.8)  // Ajusta o espaçamento entre as barras
    .attr("height", d => yScale(d.metric[0])) 
    .attr("fill", barColor)
    .attr("stroke-width", 0)  // Sem contorno inicial
    .on("click", (event, d) => click(d, message));

  // Evento de mousemove no contêiner SVG para encontrar a barra mais próxima do mouse
  svg.on("mousemove", function (event) {
    const [mouseX] = d3.pointer(event);
    
    // Encontrar a barra mais próxima do mouse
    let closestBar = null;
    let minDistance = Infinity;

    bars.each(function (d) {
      const barX = parseFloat(d3.select(this).attr("x")) + xScale.bandwidth() / 2; // Ponto central da barra
      const distance = Math.abs(barX - mouseX);

      if (distance < minDistance) {
        minDistance = distance;
        closestBar = this;
      }
    });

    // Destacar a barra mais próxima
    if (closestBar) {
      d3.select(closestBar)
        .raise()
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("stroke-opacity", 0.5)
        .attr("width", xScale.bandwidth() + 4)
        .attr("x", d => xScale(d.temporalDimension[0]) - 2);

      // Mostrar a tooltip
      const d = d3.select(closestBar).data()[0];
      tooltip
        .html(buildTooltip(d, message.fields, "barras"))
        .style("opacity", 1)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    }
  })
  .on("mouseout", function () {
    // Restaurar todas as barras ao estilo original
    bars
      .attr("stroke", "none")
      .attr("stroke-width", 0)
      .attr("width", xScale.bandwidth())
      .attr("x", d => xScale(d.temporalDimension[0]));

    // Ocultar a tooltip
    tooltip.style("opacity", 0);
  });
};

// Função para criar escalas X e Y para o gráfico de dispersão
const createScatterScales = (data, chartWidth, chartHeight, message) => {
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

  // Criar a escala X
  const xScale = d3.scaleBand()
    .domain(data.map(d => d.temporalDimension[0]))
    .range([0, chartWidth])
    .padding(0.2);

  return { xScale, yScale, filteredData };
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
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.temporalDimension[0]) + xScale.bandwidth() / 2)
    .attr("cy", d => applyJitter(yScale(d.metric1[0]))) // Aplicar jitter ao valor Y
    .attr("r", 5)
    .attr("fill", d => colorScale(d.metric2[0]))
    .on("click", (event, d) => click(d, message))
    .on("mouseover", function (event, d) {
      // Mostrar a tooltip ao passar o mouse sobre o ponto
      tooltip.html(buildTooltip(d, message.fields, "dispersao")).style("opacity", 1);
      d3.select(this).raise().attr("r", 7); // Destacar o ponto trazendo-o para frente e aumentando o raio
    })
    .on("mousemove", function (event) {
      // Atualizar a posição da tooltip conforme o mouse se move
      tooltip.style("left", (event.pageX + 10) + "px").style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function () {
      // Ocultar a tooltip quando o mouse sai do ponto
      tooltip.style("opacity", 0);
      d3.select(this).attr("r", 5); // Restaurar o raio original do ponto
    });

  // Evento de mousemove no contêiner SVG para trazer o ponto mais próximo para frente
  svg.on("mousemove", function (event) {
    const [mouseX, mouseY] = d3.pointer(event);

    // Encontrar o círculo mais próximo do mouse
    let closestCircle = null;
    let minDistance = Infinity;

    circles.each(function () {
      const cx = parseFloat(d3.select(this).attr("cx"));
      const cy = parseFloat(d3.select(this).attr("cy"));
      const distance = Math.sqrt(Math.pow(cx - mouseX, 2) + Math.pow(cy - mouseY, 2));

      if (distance < minDistance) {
        minDistance = distance;
        closestCircle = this;
      }
    });

    // Trazer o círculo mais próximo para frente
    if (closestCircle) {
      d3.select(closestCircle).raise();
    }
  });
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

  // Limpar qualquer gráfico SVG existente
  d3.select("body").selectAll("svg").remove();

  // Criar o SVG principal
  const svg = d3.select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Dados e escalas para o gráfico de barras (precipitação de chuva)
  const barData = message.tables.DEFAULT;
  const xScale = createLinearXScale(barData, chartWidth);
  const barYScale = d3.scaleLinear()
    .domain([0, d3.max(barData.map(d => d.metric[0]))])
    .range([barChartHeight, 0]);
  const barColor = styleVal(message, "barColor");

  // Adicionar o grupo para o gráfico de barras
  const barSvg = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);
  
  // Desenhar o gráfico de barras
  drawBars(barSvg, barData, xScale, barYScale, chartWidth, barColor, message);

  // Adicionar eixos ao gráfico de barras
  const barXAxis = barSvg.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${barChartHeight})`)
    .call(d3.axisBottom(xScale)
      .ticks(Math.min(barData.length, 10))
      .tickFormat((d) => barData[Math.round(d)] ? barData[Math.round(d)].temporalDimension[0] : "")
    )
    .selectAll("text")
    .style("text-anchor", "end")
    .attr("dx", "-0.8em")
    .attr("dy", "0.15em")
    .attr("transform", "rotate(-45)");

  barSvg.append("g")
    .call(d3.axisLeft(barYScale).ticks(5).tickSize(0).tickPadding(10));

  // Dados e escalas para o gráfico de dispersão (concentração de agrotóxicos)
  const scatterData = message.tables.DEFAULT;
  const { xScale: scatterXScale, yScale: scatterYScale, filteredData } = createScatterScales(scatterData, chartWidth, scatterChartHeight, message);

  // Adicionar o grupo para o gráfico de dispersão
  const scatterSvg = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top + barChartHeight + margin.bottom})`);
  
  // Desenhar o gráfico de dispersão
  drawScatter(scatterSvg, filteredData, scatterXScale, scatterYScale, message);

  // Filtrar as datas para exibir apenas algumas
  const filteredDates = scatterXScale.domain().filter((d, i) => i % Math.ceil(scatterXScale.domain().length / 10) === 0);

  // Adicionar eixo X ao gráfico de dispersão
  scatterSvg.append("g")
    .attr("transform", `translate(0, ${scatterChartHeight})`)
    .call(
      d3.axisBottom(scatterXScale)
        .tickValues(filteredDates)
        .tickFormat(d => formatDate(d))
        .tickSize(0)
        .tickPadding(10)
    )
    .selectAll("text");

  scatterSvg.append("g")
    .call(d3.axisLeft(scatterYScale)
      .ticks(5)
      .tickFormat(autoFormat(scatterYScale))
      .tickSize(0)
      .tickPadding(10)) // Usar formatação automática
    .attr("transform", `translate(0, 0)`);
};

// Renderizar localmente ou no Google Data Studio
if (LOCAL) {
  drawViz(local.message);
} else {
  dscc.subscribeToData(drawViz, { transform: dscc.objectTransform });
}
