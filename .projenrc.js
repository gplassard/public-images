const { GithubWorkflow, GitHub } = require('projen/lib/github');
const { BaseProject, WorkflowActionsX, githubAction } = require('@gplassard/projen-extensions');

const project = new BaseProject({
   name: 'public-images',
});
const github = GitHub.of(project);

const job = new GithubWorkflow(github, 'publish-plakar', {
   name: 'Publish Plakar',
});
job.on({
   workflowDispatch: {},
   push: {
      branches: ['main'],
      paths: ['plakar-tag.txt'],
   },
});
job.addJobs({
   'build-and-push': {
      runsOn: 'ubuntu-latest',
      permissions: {
         contents: 'read',
         packages: 'write',
      },
      steps: [
         WorkflowActionsX.checkout({}),
         {
            name: 'Read tag from file',
            id: 'tag',
            run: 'echo "TAG=$(cat plakar-tag.txt)" >> $GITHUB_OUTPUT',
         },
          WorkflowActionsX.checkout({
            repository: 'PlakarKorp/plakar',
            ref: '${{ steps.tag.outputs.TAG }}',
          }),
         {
            name: 'Log in to GHCR',
            uses: 'docker/login-action@v3',
            with: {
               registry: 'ghcr.io',
               username: '${{ github.actor }}',
               password: '${{ secrets.GITHUB_TOKEN }}',
            },
         },
         {
            name: 'Build and push Docker image',
            uses: 'docker/build-push-action@v5',
            with: {
               context: '.',
               file: './Dockerfile',
               push: true,
               tags: 
`'ghcr.io/\${{ github.repository }}/plakar:\${{ steps.tag.outputs.TAG }}',
'ghcr.io/\${{ github.repository }}/plakar:latest',
`,
            },
         }
      ]
   }
});
project.synth();