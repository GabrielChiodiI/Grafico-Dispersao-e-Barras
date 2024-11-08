const d3 = require('d3');
const dscc = require('@google/dscc');
const local = require('./localMessage.js');

// Definir se estamos em desenvolvimento local
export const LOCAL = false;

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

// Função para formatar os dados da tooltip
const formatTooltipData = (d, message, chartType) => {
    // Obter o rótulo do campo de data
    const dateLabel = message.fields.temporalDimension[0].name;
    
    // Variáveis para armazenar os rótulos e valores dos campos
    let metricLabel, metricValue, additionalMetricLabel = "", additionalMetricValue = "";

    if (chartType === "bar") {
        // Configurações para o gráfico de barras
        metricLabel = message.fields.metric[0].name; // "Precipitação"
        metricValue = d.metric[0];
    } else if (chartType === "scatter") {
        // Configurações para o gráfico de dispersão
        metricLabel = message.fields.metric1[0].name; // "CONCENTRAÇÃO (µg L⁻¹)"
        metricValue = d.metric1[0];
        
        additionalMetricLabel = message.fields.metric2[0].name; // "AGROTÓXICO"
        additionalMetricValue = d.metric2[0];
    }

    // Formatar a data
    const date = d3.timeFormat("%d/%m/%Y")(d.temporalDimension);

    // Estruturar o conteúdo da tooltip
    return `
        <div style="margin-bottom: 4px"><strong>${dateLabel}:</strong> ${date}</div>
        <div style="margin-bottom: 4px"><strong>${metricLabel}:</strong> ${metricValue}</div>
        ${chartType === "scatter" ? `<div><strong>${additionalMetricLabel}:</strong> ${additionalMetricValue}</div>` : ""}
    `;
};

// Primeiro, adicionamos o elemento tooltip ao body
const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background-color", "white")
    .style("border", "1px solid #ddd")
    .style("border-radius", "4px")
    .style("padding", "8px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)");

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
const createTimeXScale = (data, chartWidth) => {
    return d3.scaleTime()
        .domain(d3.extent(data, d => d.temporalDimension))
        .range([0, chartWidth]);
};

// Função para desenhar o gráfico de barras (precipitação de chuva)
const drawBars = (svg, data, xScale, yScale, chartWidth, message) => {
    const barColor = styleVal(message, "barColor");

    // Calcula a largura da barra baseada na escala atual
    const barWidth = () => {
        const step = chartWidth / data.length;
        return Math.max(1, step * 1); // Garante uma largura mínima de 1px
    };

    const bars = svg.select(".chart-area")
        .selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", d => xScale(d.temporalDimension))
        .attr("y", 0)
        .attr("width", barWidth)
        .attr("height", d => yScale(d.metric[0]))
        .attr("fill", barColor)
        .attr("fill-opacity", 1)
        .attr("stroke", "none")
        .on("mouseover", function(event, d) {
            // Destaca a barra
            d3.select(this)
                .raise()
                .transition()
                .duration(200)
                .attr("r", 20)
                .style("stroke", barColor)
                .style("stroke-width", 15);

            // Mostra a tooltip com dados formatados
            tooltip
                .html(formatTooltipData(d, message, "bar"))
                .style("opacity", 1)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mousemove", function(event) {
            // Move a tooltip com o mouse
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            // Retorna a barra ao estilo original
            d3.select(this)
                .transition()
                .duration(200)
                .attr("r", 5)
                .style("stroke", "none");

            // Esconde a tooltip
            tooltip.style("opacity", 0);
        });
};

// Função para criar escalas X e Y para o gráfico de dispersão
const createScatterScales = (data, chartHeight, message) => {
    const { scatterFilter1, scatterFilter2 } = getScatterFilters(message);

    const filteredData = data.filter(d => {
        const metricValue = d.metric1[0];
        return metricValue >= scatterFilter2 && metricValue <= scatterFilter1;
    });

    const maxDataValue = d3.max(filteredData, d => d.metric1[0]);
    const minDataValue = d3.min(filteredData, d => d.metric1[0]);
    const padding = (maxDataValue - minDataValue) * 0.016;

    const yScale = d3.scaleLinear()
        .domain([minDataValue - padding, maxDataValue + padding])
        .range([chartHeight, 0]);

    return { yScale, filteredData };
};

// Função para desenhar o gráfico de dispersão (atualizada com tooltip)
const drawScatter = (svg, filteredData, xScale, yScale, message) => {
    const scatterColor = styleVal(message, "scatterColor");
    
    const showNulls = (message.style.scatterFilter3.value === "true") ||
        (message.style.scatterFilter3.defaultValue === "true");

    const jitterAmount = 5;
    const applyJitter = (yValue) => yValue + (Math.random() - 0.5) * jitterAmount;

    const circles = svg.select(".chart-area")
        .selectAll("circle")
        .data(filteredData.filter(d => showNulls || d.metric1[0] !== null))
        .join("circle")
        .attr("cx", d => xScale(d.temporalDimension))
        .attr("cy", d => applyJitter(yScale(d.metric1[0])))
        .attr("r", 5)
        .attr("fill", scatterColor)
        .on("mouseover", function(event, d) {
            // Aumenta o ponto e traz para frente
            d3.select(this)
                .raise()
                .transition()
                .duration(200)
                .attr("r", 7)
                .style("stroke", "#000")
                .style("stroke-width", 2);
            
            // Mostra a tooltip
            tooltip
                .html(formatTooltipData(d, message, "scatter"))
                .style("opacity", 1)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mousemove", function(event) {
            // Move a tooltip com o mouse
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            // Retorna o ponto ao tamanho normal
            d3.select(this)
                .transition()
                .duration(200)
                .attr("r", 5)
                .style("stroke", "none");
            
            // Esconde a tooltip
            tooltip.style("opacity", 0);
        })
        .on("click", (event, d) => click(d, message));

    // Eventos de mousemove no SVG para destacar o ponto mais próximo
    svg.on("mousemove", function(event) {
        const [mouseX, mouseY] = d3.pointer(event);
        let closestCircle = null;
        let minDistance = Infinity;

        circles.each(function() {
            const cx = parseFloat(d3.select(this).attr("cx"));
            const cy = parseFloat(d3.select(this).attr("cy"));
            const distance = Math.sqrt(Math.pow(cx - mouseX, 2) + Math.pow(cy - mouseY, 2));

            if (distance < minDistance) {
                minDistance = distance;
                closestCircle = this;
            }
        });

        if (closestCircle) {
            d3.select(closestCircle).raise();
        }
    });
};

const drawViz = (message) => {
    const margin = { left: 80, right: 20, top: 20, bottom: 30 };
    const height = dscc.getHeight() - margin.top - margin.bottom;
    const width = dscc.getWidth() - margin.left - margin.right;
    const barChartHeight = height * 0.35 - margin.top - margin.bottom;
    const scatterChartHeight = height * 0.65 - margin.top - margin.bottom;
    const chartWidth = width - margin.left - margin.right;

    const parseDate = d3.timeParse("%Y%m%d");
    const data = message.tables.DEFAULT.map(d => ({
        ...d,
        temporalDimension: parseDate(d.temporalDimension[0])
    }));
    
    const xScale = createTimeXScale(data, chartWidth);

    d3.select("body").selectAll("svg").remove();

    const svg = d3.select("body")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Criar clip paths para ambos os gráficos
    svg.append("defs")
        .append("clipPath")
        .attr("id", "bar-clip")
        .append("rect")
        .attr("width", chartWidth)
        .attr("height", barChartHeight);

    svg.append("defs")
        .append("clipPath")
        .attr("id", "scatter-clip")
        .append("rect")
        .attr("width", chartWidth)
        .attr("height", scatterChartHeight);

    const barYScale = d3.scaleLinear()
        .domain([0, d3.max(data.map(d => d.metric[0]))])
        .range([0, barChartHeight]);

    // Configurar o gráfico de barras com clipping
    const barSvg = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Adicionar área com clip-path para as barras
    barSvg.append("g")
        .attr("class", "chart-area")
        .attr("clip-path", "url(#bar-clip)");

    drawBars(barSvg, data, xScale, barYScale, chartWidth, message);

    // Adicionar eixos ao gráfico de barras
    barSvg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, 0)`)
        .call(d3.axisTop(xScale)
            .tickFormat("")
            .tickSize(0));

    barSvg.append("g")
        .call(d3.axisLeft(barYScale)
            .ticks(5)
            .tickSize(0)
            .tickPadding(10));

    // Borda no final do gráfico de barras
    barSvg.append("rect")
        .attr("x", chartWidth - 1)
        .attr("y", 0)
        .attr("width", 1)
        .attr("height", barChartHeight)
        .attr("fill", "#000000");

    // Adicionar descrição do eixo Y para o gráfico de barras
    barSvg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left)
        .attr("x", -barChartHeight / 2)
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text(message.style.labelBarY.value || message.fields.metric[0].name);

    const {yScale: scatterYScale, filteredData} = createScatterScales(data, scatterChartHeight, message);

    // Configurar o gráfico de dispersão com clipping
    const scatterSvg = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top + barChartHeight + margin.bottom})`);

    // Adicionar área com clip-path para os pontos
    scatterSvg.append("g")
        .attr("class", "chart-area")
        .attr("clip-path", "url(#scatter-clip)");

    drawScatter(scatterSvg, filteredData, xScale, scatterYScale, message);

    // Adicionar eixos ao gráfico de dispersão
    scatterSvg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${scatterChartHeight})`)
        .call(d3.axisBottom(xScale)
            .ticks(20)
            .tickFormat(d3.timeFormat("%d/%m/%Y"))
            .tickSize(0)
            .tickPadding(5))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("transform", "rotate(-15)");

    scatterSvg.append("g")
        .call(d3.axisLeft(scatterYScale)
            .ticks(5)
            .tickFormat(autoFormat(scatterYScale))
            .tickSize(0)
            .tickPadding(10))
        .attr("transform", `translate(0, 0)`);

    scatterSvg.append("rect")
        .attr("x", chartWidth - 1)
        .attr("y", 0)
        .attr("width", 1)
        .attr("height", scatterChartHeight)
        .attr("fill", "#000000");

    // Adicionar descrição do eixo X para o gráfico de dispersão
    scatterSvg.append("text")
        .attr("y", scatterChartHeight + margin.bottom + margin.top)
        .attr("x", chartWidth / 2)
        .style("text-anchor", "middle")
        .text(message.style.labelScatterX.value || message.fields.temporalDimension[0].name);

    // Adicionar descrição do eixo Y para o gráfico de dispersão
    scatterSvg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left)
        .attr("x", -scatterChartHeight / 2)
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text(message.style.labelScatterY.value || message.fields.metric1[0].name);
    
    const zoom = d3.zoom()
        .scaleExtent([1, 15])
        .translateExtent([[0, 0], [chartWidth, height]])
        .on("zoom", (event) => {
            const newXScale = event.transform.rescaleX(xScale);

            drawBars(barSvg, data, newXScale, barYScale, chartWidth, message);
            drawScatter(scatterSvg, filteredData, newXScale, scatterYScale, message);

            barSvg.select(".x-axis")
                .call(d3.axisTop(newXScale)
                    .tickFormat("")
                    .tickSize(0));

            scatterSvg.select(".x-axis")
                .call(d3.axisBottom(newXScale)
                    .ticks(10)
                    .tickFormat(d3.timeFormat("%d/%m/%Y"))
                    .tickSize(0)
                    .tickPadding(5))
                .selectAll("text")
                .style("text-anchor", "end")
                .attr("transform", "rotate(-15)");
        });

    if (message.style.zoom.value == true || message.style.zoom.defaultValue == true) {
        svg.call(zoom);
    }
};

// Renderizar localmente ou no Google Data Studio
if (LOCAL) {
    drawViz(local.message);
} else {
    dscc.subscribeToData(drawViz, { transform: dscc.objectTransform });
}
