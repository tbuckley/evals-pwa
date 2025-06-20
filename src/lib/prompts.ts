export const DEFAULT_LLM_ASSERTION_PROVIDER = 'gemini:gemini-2.5-pro';

export const LLM_RUBRIC_PROMPT = `
You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {message: string; pass: boolean}.

Examples:

<Output>
Hello world
</Output>
<Rubric>
Content contains a greeting
</Rubric>
{"message": "the content contains the word 'hello'", "pass": true}

<Output>
Avast ye swabs, repel the invaders!
</Output>
<Rubric>
Does not speak like a pirate
</Rubric>
{"message": "'avast ye' is a common pirate term", "pass": false}

<Output>{{#each output}}
{{ this }}
{{/each}}</Output>
<Rubric>
{{ rubric }}
</Rubric>
`.trim();

export const SELECT_BEST_PROMPT = `
You are comparing multiple documents to see which best fits the following criteria: {{criteria}}

Here are the documents:

{{#each output}}
<Document index="{{ @index }}">
{{#each this}}{{ this }}{{/each}}
</Document>
{{/each}}

Output the index of the document that best fits the criteria. You must output a single integer.
`.trim();

export const CONSISTENCY_PROMPT = `
You are grading a set of documents according to the following criteria: {{criteria}}
Respond with a JSON object with this structure: {message: string; pass: boolean}

Here is the set of documents:

{{#each output}}
<Document index="{{ @index }}">
{{#each this}}{{ this }}{{/each}}
</Document>
{{/each}}
`.trim();
