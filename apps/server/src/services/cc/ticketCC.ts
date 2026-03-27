// Ticket CC system prompt template
export function buildTicketSystemPrompt(
  projectId: string,
  ticketNumber: number,
  title: string,
  description: string,
  taskBrief?: string,
  apiBaseUrl?: string,
): string {
  const base = taskBrief || `# Ticket #${ticketNumber}: ${title}

## Description
${description}

## Instructions
1. Implement the changes described above
2. Write tests if applicable
3. Commit your changes with clear commit messages
4. Push to the remote branch
5. Verify your implementation against the ticket description
6. Wait for CI notification — if CI fails, fix and retry`;

  return `${base}

## Important
- Always refer back to the ticket description to verify completeness
- After finishing, update your ticket status to "reviewing" via the API
- API base: ${apiBaseUrl || "http://localhost:7700"}
- PATCH /api/projects/${projectId}/tickets/${ticketNumber} with {"status": "reviewing"}`;
}
