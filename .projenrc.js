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
            name: 'Prepare Plakar build sources',
            id: 'prepare',
            uses: './.github/actions/prepare-plakar-build',
         },
         {
            name: 'Extract major version',
            id: 'major',
            run: 'echo "MAJOR=$(echo ${{ steps.prepare.outputs.plakar_tag }} | sed -E \'s/^(v?[0-9]+).*/\\1/\')" >> "$GITHUB_OUTPUT"',
         },
         {
            name: 'Extract minor version',
            id: 'minor',
            run: 'echo "MINOR=$(echo ${{ steps.prepare.outputs.plakar_tag }} | sed -E \'s/^(v?[0-9]+\\.[0-9]+).*/\\1/\')" >> "$GITHUB_OUTPUT"',
         },
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
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.minor.outputs.MINOR }},
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.prepare.outputs.plakar_tag }},
ghcr.io/\${{ github.repository }}/plakar:\${{ steps.prepare.outputs.plakar_tag }}-\${{ steps.sha.outputs.SHORT_SHA }}`,
               'build-args': `K8S_VERSION=\${{ steps.prepare.outputs.k8s_semver }}\nRCLONE_VERSION=\${{ steps.prepare.outputs.rclone_semver }}`,
            },
         },
      ]
   }
});

const prBuild = new GithubWorkflow(github, 'build', {
   name: 'Build',
});
prBuild.on({
   pullRequest: {},
});
prBuild.addJobs({
   build: {
      runsOn: 'ubuntu-latest',
      permissions: {
         contents: 'read',
      },
      steps: [
         WorkflowActionsX.checkout({}),
         {
            name: 'Prepare Plakar build sources',
            id: 'prepare',
            uses: './.github/actions/prepare-plakar-build',
         },
         {
            name: 'Build Docker image',
            uses: 'docker/build-push-action@v5',
            with: {
               context: '.',
               file: './Dockerfile',
               push: false,
               'build-args': 'K8S_VERSION=${{ steps.prepare.outputs.k8s_semver }}\nRCLONE_VERSION=${{ steps.prepare.outputs.rclone_semver }}',
            },
         },
      ],
   },
});
project.synth();
