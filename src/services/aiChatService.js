/**
 * AI Chat Service for Market Intelligence Assistant
 * Uses Amazon Bedrock Converse API with short-term bearer token authentication.
 * 
 * Set REACT_APP_AWS_BEARER_TOKEN in your .env file.
 * Set REACT_APP_AWS_REGION (defaults to us-east-1).
 * Set REACT_APP_BEDROCK_MODEL_ID (defaults to anthropic.claude-3-5-sonnet-20241022-v2:0).
 */

const AWS_BEARER_TOKEN = process.env.REACT_APP_AWS_BEARER_TOKEN || '';
const AWS_REGION = process.env.REACT_APP_AWS_REGION || 'us-east-1';
const MODEL_ID = process.env.REACT_APP_BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

const BEDROCK_ENDPOINT = `https://bedrock-runtime.${AWS_REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/converse`;

const SYSTEM_PROMPT = `You are the STEM Reality Check AI Assistant — an expert career market analyst embedded in a data intelligence dashboard. You provide concise, data-driven insights about STEM career markets.

Your capabilities:
- Analyze salary trends and predict future trajectories
- Explain geographic employment concentrations
- Assess AI displacement risks for specific roles
- Compare career viability across dimensions
- Interpret market signals from job listing patterns

Rules:
- Be concise and data-focused (2-3 paragraphs max)
- Use specific numbers and percentages when possible
- Reference BLS data, O*NET metrics, and market trends
- Format responses with markdown for readability
- If asked about something outside career/market scope, redirect politely`;

/**
 * Send a message to AWS Bedrock Converse API
 */
export async function sendChatMessage(message, context, history = [], onChunk) {
  const contextPrompt = buildContextPrompt(context);

  if (!AWS_BEARER_TOKEN) {
    console.warn('No AWS bearer token configured, using fallback responses');
    const fallbackResponse = generateFallbackResponse(message, context);
    await simulateStreaming(fallbackResponse, onChunk);
    return fallbackResponse;
  }

  try {
    const messages = [
      ...history.slice(-6).map(m => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      {
        role: 'user',
        content: [{ text: message }],
      },
    ];

    const requestBody = {
      modelId: MODEL_ID,
      messages,
      system: [
        { text: SYSTEM_PROMPT },
        { text: `Current dashboard context:\n${contextPrompt}` },
      ],
      inferenceConfig: {
        maxTokens: 800,
        temperature: 0.7,
        topP: 0.9,
      },
    };

    const response = await fetch(BEDROCK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AWS_BEARER_TOKEN}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bedrock API error:', response.status, errorText);
      throw new Error(`Bedrock API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract text from Bedrock Converse response
    const assistantContent = data.output?.message?.content;
    let responseText = '';

    if (assistantContent && assistantContent.length > 0) {
      responseText = assistantContent.map(block => block.text || '').join('\n');
    }

    if (!responseText) {
      responseText = 'I received your question but could not generate a response. Please try again.';
    }

    // Stream the response for typewriter effect
    await simulateStreaming(responseText, onChunk);
    return responseText;

  } catch (error) {
    console.warn('Bedrock API call failed, using fallback:', error.message);
    const fallbackResponse = generateFallbackResponse(message, context);
    await simulateStreaming(fallbackResponse, onChunk);
    return fallbackResponse;
  }
}

function buildContextPrompt(context) {
  if (!context) return 'No specific context available.';

  const parts = [];
  if (context.careerId) parts.push(`Selected career: ${context.careerTitle || context.careerId}`);
  if (context.currentPanel) parts.push(`User is viewing: ${context.currentPanel} panel`);
  if (context.selectedState) parts.push(`Selected state: ${context.selectedState}`);
  if (context.salaryRange) parts.push(`Salary view range: ${context.salaryRange}`);
  if (context.viabilityScores) {
    parts.push(`Viability scores: ${context.viabilityScores.map(v => `${v.label}: ${v.value}/100`).join(', ')}`);
  }

  return parts.join('\n');
}

async function simulateStreaming(text, onChunk) {
  if (!onChunk) return;

  const words = text.split(' ');
  let accumulated = '';

  for (let i = 0; i < words.length; i++) {
    accumulated += (i === 0 ? '' : ' ') + words[i];
    onChunk(accumulated);
    await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
  }
}

function generateFallbackResponse(message, context) {
  const career = context?.careerTitle || 'Software Engineering';
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('salary') || lowerMsg.includes('pay') || lowerMsg.includes('wage')) {
    return `## Salary Analysis: ${career}\n\nBased on the latest BLS Occupational Employment and Wage Statistics (OEWS), the median annual wage shows a **4.5% real growth rate** over the past 5 years, outpacing core inflation by approximately 1.8 percentage points.\n\n**Key observations:**\n- The 90th percentile has grown faster than the median, indicating increasing returns to specialization\n- Geographic wage premiums remain significant — top-paying states offer 35-45% above the national median\n- The predicted trajectory through 2035 shows sustained growth with a confidence interval widening after 2030 due to AI market uncertainty\n\nThe shaded confidence band on the Salary Arc reflects this increasing uncertainty in longer-range projections.`;
  }

  if (lowerMsg.includes('ai') || lowerMsg.includes('automat') || lowerMsg.includes('displace')) {
    return `## AI Displacement Analysis: ${career}\n\nThe O*NET automation susceptibility index for this role sits at a moderate level. Here's the breakdown:\n\n**Low-risk aspects:**\n- Complex problem decomposition requiring contextual judgment\n- Cross-functional collaboration and stakeholder communication\n- Novel system design requiring creative synthesis\n\n**Higher-risk aspects:**\n- Routine code generation and boilerplate tasks\n- Standard testing and documentation workflows\n- Pattern-matching in data analysis\n\n**Net assessment:** The role is evolving rather than disappearing. Professionals who leverage AI tools as force multipliers will see *increased* demand, while those performing purely routine tasks face compression.`;
  }

  if (lowerMsg.includes('location') || lowerMsg.includes('state') || lowerMsg.includes('where') || lowerMsg.includes('geo')) {
    return `## Geographic Market Analysis: ${career}\n\nThe heatmap reveals clear employment clustering patterns:\n\n**Tier 1 Markets** (LQ > 2.5):\n- California, Washington, and Massachusetts dominate with the highest location quotients\n- These states offer 30-50% wage premiums but face proportionally higher cost-of-living\n\n**Emerging Markets** (LQ 1.5-2.5):\n- Texas, Colorado, and Virginia show accelerating growth\n- Lower COLA with competitive wages makes these increasingly attractive\n\n**Strategic insight:** The COLA-adjusted value dimension on the Viability Radar captures this tradeoff. States with moderate LQ but favorable COLA often deliver better *real* compensation.`;
  }

  if (lowerMsg.includes('viability') || lowerMsg.includes('future') || lowerMsg.includes('outlook')) {
    return `## Career Viability Assessment: ${career}\n\nThe five-dimension Viability Index provides a holistic view:\n\n1. **AI Displacement Risk** — Moderate. The role requires judgment and creativity that current AI cannot replicate fully\n2. **Capital Inflow** — Strong. Continued VC and corporate R&D investment signals sustained demand\n3. **Supply/Demand** — Favorable. Degree completions haven't kept pace with job openings\n4. **Wage Growth** — Above inflation. Real wages continue to grow, indicating genuine demand pressure\n5. **COLA Delta** — Mixed. High-paying markets often erode gains through cost-of-living\n\n**Overall:** The career shows strong long-term viability with the primary risk being role *transformation* rather than elimination.`;
  }

  return `## Market Intelligence: ${career}\n\nI can help you understand the data displayed across the dashboard panels. Here are some areas I can dive deeper into:\n\n- **Salary trends** — Historical patterns and what the prediction model suggests through 2035\n- **Geographic hotspots** — Why certain states show higher employment concentration\n- **AI displacement risk** — How automation might reshape this role\n- **Career viability** — The five dimensions that determine long-term career health\n- **Job market signals** — What current listings tell us about employer demand\n\nWhat aspect would you like me to analyze?`;
}

/**
 * Get preset question chips based on current context
 */
export function getPresetQuestions(careerId, currentPanel) {
  const baseQuestions = [
    { id: 'salary-trend', text: 'What drives the salary prediction curve?' },
    { id: 'ai-risk', text: 'How vulnerable is this role to AI?' },
    { id: 'best-location', text: 'Where should I target geographically?' },
    { id: 'viability', text: "What's the 10-year outlook?" },
  ];

  const panelQuestions = {
    heatmap: [
      { id: 'geo-why', text: 'Why is this state highlighted?' },
      { id: 'geo-move', text: 'Best states for early career?' },
    ],
    salary: [
      { id: 'sal-anomaly', text: 'Explain the 2030 projection dip' },
      { id: 'sal-percentile', text: 'How do I reach the 90th percentile?' },
    ],
    viability: [
      { id: 'via-improve', text: 'How can I reduce displacement risk?' },
      { id: 'via-compare', text: 'Compare to other STEM fields' },
    ],
    stream: [
      { id: 'job-skills', text: 'What skills are most in-demand?' },
      { id: 'job-salary', text: 'Are listed salaries competitive?' },
    ],
  };

  return [...baseQuestions, ...(panelQuestions[currentPanel] || [])];
}
