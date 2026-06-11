# Trismegistus Dashboard Justfile

default:
    @just --list

# Start the development server
dev:
    npm run dev

# Build the production bundle
build:
    npm run build

# Run TypeScript type check
typecheck:
    npx tsc --noEmit

# Lint the codebase
lint:
    npm run lint

# Clean build artifacts
clean:
    rm -rf dist node_modules/.tmp

# Team commit-attribution -- route commits by changed path -> role.
commit MSG:
    npx tsx .team/team-commit.ts "{{MSG}}"

commit-push MSG:
    npx tsx .team/team-commit.ts "{{MSG}}" --push

commit-solo MSG:
    npx tsx .team/team-commit.ts "{{MSG}}" --solo

team-status:
    npx tsx .team/team-commit.ts --dry-run
