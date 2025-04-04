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
