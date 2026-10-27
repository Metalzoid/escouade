# Azure DevOps' answers, after Microsoft's documentation

The answers of the REST API 7.1 the client reads, shaped after the examples of
<https://learn.microsoft.com/rest/api/azure/devops/> (Git: Pull Requests, Pull Request Threads,
Pull Request Statuses, Policy Configurations; Policy: Evaluations; Build: Builds, Timeline, Logs;
`_apis/connectionData`), trimmed to what Escouade reads. The organization is `acme`, the project
`Demo Project`, the repository `demo`. To check them against a real organization:
`real_azure_devops` in `src-tauri/src/forge/azure_tests.rs`.
