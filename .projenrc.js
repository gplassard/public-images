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
            name: 'Get short SHA',
            id: 'sha',
            run: 'echo "SHORT_SHA=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT',
         },
         {
            name: 'Read tag from file',
            id: 'tag',
            run: 'echo "TAG=$(cat plakar-tag.txt)" >> $GITHUB_OUTPUT',
         },
         {
            name: 'Extract major version',
            id: 'major',
            run: 'echo "MAJOR=$(echo ${{ steps.tag.outputs.TAG }} | sed -E \'s/^(v?[0-9]+).*/\\1/\')" >> $GITHUB_OUTPUT',
         },
          WorkflowActionsX.checkout({
            repository: 'PlakarKorp/plakar',
            ref: '${{ steps.tag.outputs.TAG }}',
            path: 'plakar-src',
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
               tags: `ghcr.io/\${{ github.repository }}/plakar:latest,
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.major.outputs.MAJOR }},
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.tag.outputs.TAG }}-\${{ steps.sha.outputs.SHORT_SHA }}`,
            },
         }
      ]
   }
});
project.synth();